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

    /*
     * First pass:
     * Try the complete user question.
     *
     * This preserves the strongest possible lexical signal.
     */
    const primaryResults = await searchQuery(
      normalizedQuestion,
      k,
      allowedDocumentIds,
    );

    /*
     * If the complete question already produced enough
     * candidates, there is no reason to broaden the search.
     */
    if (primaryResults.length >= k) {
      return primaryResults;
    }

    /*
     * Second pass:
     * Break the question into adjacent concept pairs.
     *
     * Example:
     *
     * "ajustar estoque através da contagem de estoque"
     *
     * becomes approximately:
     *
     * "ajustar estoque"
     * "estoque através"
     * "através contagem"
     * "contagem estoque"
     *
     * PostgreSQL's Portuguese stemming will normalize
     * variations such as "ajustar" -> "ajust".
     */
    const conceptQueries =
      buildConceptQueries(normalizedQuestion);

    if (conceptQueries.length === 0) {
      return primaryResults;
    }

    const conceptResults = await Promise.all(
      conceptQueries.map((query) =>
        searchQuery(
          query,
          k,
          allowedDocumentIds,
        ),
      ),
    );

    /*
     * Merge by chunk ID.
     *
     * A chunk appearing in multiple concept searches
     * receives a higher score because multiple parts of
     * the question matched the same chunk.
     */
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

    /*
     * Re-rank using:
     *
     * - original lexical score
     * - number of concept queries matched
     *
     * Multiple matching concepts indicate that the
     * chunk is more representative of the question.
     */
    return Array.from(merged.values())
      .map(({ result, matchedQueries }) => ({
        result,
        finalScore:
          result.lexical_score +
          Math.max(0, matchedQueries - 1) * 0.05,
      }))
      .sort(
        (a, b) => b.finalScore - a.finalScore,
      )
      .slice(0, k)
      .map(({ result, finalScore }) => ({
        ...result,
        lexical_score: finalScore,
      }));
  },
};