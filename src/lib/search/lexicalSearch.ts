import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { documentChunks } from "../../db/schema/documentChunks.js";
import { documents } from "../../db/schema/documents.js";

export interface LexicalSearchResult {
  chunk: {
    id: string;
    text: string;
    source_file: string;
    chunk_index: number;
    char_start: number;
    char_end: number;
  };
  lexical_score: number;
}

const STOPWORDS = new Set([
  "a",
  "à",
  "ao",
  "aos",
  "as",
  "às",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "entre",
  "essa",
  "esse",
  "esta",
  "este",
  "para",
  "por",
  "que",
  "se",
  "sem",
  "um",
  "uma",
  "uns",
  "umas",
  "no",
  "na",
  "nos",
  "nas",
  "ou",
]);

function extractTerms(question: string): string[] {
  return question
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 3)
    .filter((term) => !STOPWORDS.has(term));
}

function buildConceptQueries(question: string): string[] {
  const terms = extractTerms(question);

  if (terms.length <= 1) {
    return terms;
  }

  const queries: string[] = [];

  for (let i = 0; i < terms.length - 1; i++) {
    queries.push(`${terms[i]} ${terms[i + 1]}`);
  }

  return [...new Set(queries)];
}

function buildTermRecallQuery(question: string): string {
  return extractTerms(question)
    .map((term) => term.replace(/["\\]/g, ""))
    .filter(Boolean)
    .join(" OR ");
}

async function searchQuery(
  question: string,
  k: number,
  allowedDocumentIds?: string[],
): Promise<LexicalSearchResult[]> {
  const normalizedQuestion = question.trim();

  if (!normalizedQuestion) {
    return [];
  }

  const query = sql`websearch_to_tsquery(
    'portuguese',
    ${normalizedQuestion}
  )`;

  const conditions = [
    sql`${documentChunks.searchVector} @@ ${query}`,
    eq(documents.status, "processed"),
  ];

  if (allowedDocumentIds) {
    if (allowedDocumentIds.length === 0) {
      return [];
    }

    conditions.push(
      sql`${documentChunks.documentId} IN (${sql.join(
        allowedDocumentIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  }

  const results = await db
    .select({
      id: documentChunks.id,
      text: documentChunks.text,
      chunkIndex: documentChunks.chunkIndex,
      charStart: documentChunks.charStart,
      charEnd: documentChunks.charEnd,
      documentId: documentChunks.documentId,
      filename: documents.filename,
      score: sql<number>`
        ts_rank_cd(
          ${documentChunks.searchVector},
          ${query}
        )
      `,
    })
    .from(documentChunks)
    .innerJoin(
      documents,
      eq(documents.id, documentChunks.documentId),
    )
    .where(and(...conditions))
    .orderBy(
      desc(
        sql`
          ts_rank_cd(
            ${documentChunks.searchVector},
            ${query}
          )
        `,
      ),
    )
    .limit(k);

  return results.map((result) => ({
    chunk: {
      id: result.id,
      text: result.text,
      source_file: result.filename,
      chunk_index: result.chunkIndex,
      char_start: result.charStart,
      char_end: result.charEnd,
    },
    lexical_score: Number(result.score),
  }));
}

export const lexicalSearchService = {
  async search(
    question: string,
    k: number,
    allowedDocumentIds?: string[],
  ): Promise<LexicalSearchResult[]> {
    const normalizedQuestion = question.trim();

    if (!normalizedQuestion) {
      return [];
    }

    const terms = extractTerms(normalizedQuestion);

    // Avoid sending an all-stopword query to PostgreSQL.
    // PostgreSQL otherwise emits a NOTICE and cannot produce useful FTS matches.
    if (terms.length === 0) {
      return [];
    }

    /*
     * Pass 1:
     * Complete question. This preserves the strongest exact
     * lexical signal when the question maps cleanly to the text.
     */
    const primaryResults = await searchQuery(
      normalizedQuestion,
      k,
      allowedDocumentIds,
    );

    if (primaryResults.length >= k) {
      return primaryResults;
    }

    /*
     * Pass 2:
     * Adjacent significant-term pairs. This relaxes the
     * all-terms-AND behavior of the complete question while
     * retaining small concept groups.
     */
    const conceptQueries =
      buildConceptQueries(normalizedQuestion);

    const conceptResults =
      await Promise.all(
        conceptQueries.map((query) =>
          searchQuery(query, k, allowedDocumentIds),
        ),
      );

    const merged = new Map<
      string,
      {
        result: LexicalSearchResult;
        matchedQueries: number;
      }
    >();

    for (const result of primaryResults) {
      merged.set(result.chunk.id, {
        result,
        matchedQueries: 1,
      });
    }

    for (const results of conceptResults) {
      for (const result of results) {
        const existing = merged.get(result.chunk.id);

        if (!existing) {
          merged.set(result.chunk.id, {
            result,
            matchedQueries: 1,
          });
          continue;
        }

        existing.matchedQueries += 1;
        existing.result.lexical_score = Math.max(
          existing.result.lexical_score,
          result.lexical_score,
        );
      }
    }

    let mergedResults = Array.from(merged.values())
      .map(({ result, matchedQueries }) => ({
        result,
        finalScore:
          result.lexical_score +
          Math.max(0, matchedQueries - 1) * 0.05,
      }))
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, k)
      .map(({ result, finalScore }) => ({
        ...result,
        lexical_score: finalScore,
      }));

    /*
     * Pass 3:
     * Individual-term OR fallback.
     *
     * This is deliberately only used when the stricter passes
     * did not fill the candidate pool. It improves recall for
     * questions whose wording differs from the documentation
     * while keeping the primary/concept ranking dominant.
     */
    if (mergedResults.length < k) {
      const termQuery = buildTermRecallQuery(normalizedQuestion);

      if (termQuery) {
        const termResults = await searchQuery(
          termQuery,
          k,
          allowedDocumentIds,
        );

        for (const result of termResults) {
          const existing = merged.get(result.chunk.id);

          if (!existing) {
            merged.set(result.chunk.id, {
              result,
              matchedQueries: 1,
            });
            continue;
          }

          existing.result.lexical_score = Math.max(
            existing.result.lexical_score,
            result.lexical_score,
          );
        }

        mergedResults = Array.from(merged.values())
          .map(({ result, matchedQueries }) => ({
            result,
            finalScore:
              result.lexical_score +
              Math.max(0, matchedQueries - 1) * 0.05,
          }))
          .sort((a, b) => b.finalScore - a.finalScore)
          .slice(0, k)
          .map(({ result, finalScore }) => ({
            ...result,
            lexical_score: finalScore,
          }));
      }
    }

    return mergedResults;
  },
};
