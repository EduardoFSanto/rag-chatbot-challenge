import { QdrantClient } from "@qdrant/js-client-rest";
import { embeddingService } from "../embeddings.js";
import { lexicalSearchService } from "./lexicalSearch.js";
import type { SearchResult } from "../../types/index.js";

const COLLECTION_NAME = "vrtech_knowledge";

const DEFAULT_K = 30;
const RRF_K = 60;

const client = new QdrantClient({
  url: process.env.QDRANT_URL || "http://localhost:6333",
});

interface DenseSearchResult {
  chunk: {
    id: string;
    text: string;
    source_file: string;
    chunk_index: number;
    char_start: number;
    char_end: number;
  };
  similarity_score: number;
}

export interface HybridSearchResult extends SearchResult {
  dense_score: number | null;
  lexical_score: number | null;
  rrf_score: number;
}

async function denseSearch(
  question: string,
  k: number,
  allowedDocumentIds?: string[],
): Promise<DenseSearchResult[]> {
  const queryEmbedding =
    await embeddingService.generate(question);

  let filter = undefined;

  if (allowedDocumentIds) {
    if (allowedDocumentIds.length === 0) {
      return [];
    }

    filter = {
      should: allowedDocumentIds.map((documentId) => ({
        key: "documentId",
        match: {
          value: documentId,
        },
      })),
    };
  }

  const results = await client.query(
    COLLECTION_NAME,
    {
      query: queryEmbedding,
      limit: k,
      score_threshold: 0,
      with_payload: true,
      with_vector: false,
      filter,
    },
  );

  return results.points.map((result: any) => ({
    chunk: {
      id: String(result.id),
      text: result.payload?.text ?? "",
      source_file:
        result.payload?.source_file ?? "",
      chunk_index:
        result.payload?.chunk_index ?? 0,
      char_start:
        result.payload?.char_start ?? 0,
      char_end:
        result.payload?.char_end ?? 0,
    },

    similarity_score: Number(result.score),
  }));
}

function calculateRrfScore(
  denseRank: number | null,
  lexicalRank: number | null,
): number {
  let score = 0;

  if (denseRank !== null) {
    score += 1 / (RRF_K + denseRank);
  }

  if (lexicalRank !== null) {
    score += 1 / (RRF_K + lexicalRank);
  }

  return score;
}

export const hybridSearchService = {
  async search(
    question: string,
    k = DEFAULT_K,
    allowedDocumentIds?: string[],
  ): Promise<HybridSearchResult[]> {
    const [denseResults, lexicalResults] =
      await Promise.all([
        denseSearch(
          question,
          k,
          allowedDocumentIds,
        ),

        lexicalSearchService.search(
          question,
          k,
          allowedDocumentIds,
        ),
      ]);

    const candidates = new Map<
      string,
      {
        dense: DenseSearchResult | null;
        lexical:
          | Awaited<
              ReturnType<
                typeof lexicalSearchService.search
              >
            >[number]
          | null;
        denseRank: number | null;
        lexicalRank: number | null;
      }
    >();

    denseResults.forEach((result, index) => {
      const id = result.chunk.id;

      candidates.set(id, {
        dense: result,
        lexical: null,
        denseRank: index + 1,
        lexicalRank: null,
      });
    });

    lexicalResults.forEach((result, index) => {
      const id = result.chunk.id;

      const existing = candidates.get(id);

      if (existing) {
        existing.lexical = result;
        existing.lexicalRank = index + 1;
      } else {
        candidates.set(id, {
          dense: null,
          lexical: result,
          denseRank: null,
          lexicalRank: index + 1,
        });
      }
    });

    const fusedResults: HybridSearchResult[] =
      Array.from(candidates.values()).map(
        (candidate) => {
          const base =
            candidate.dense ??
            candidate.lexical!;

          const rrfScore = calculateRrfScore(
            candidate.denseRank,
            candidate.lexicalRank,
          );

          return {
            chunk: {
              id: base.chunk.id,
              text: base.chunk.text,
              source_file:
                base.chunk.source_file,
              chunk_index:
                base.chunk.chunk_index,
              char_start:
                base.chunk.char_start,
              char_end:
                base.chunk.char_end,
              embedding: [],
            },

            similarity_score:
              candidate.dense?.similarity_score ??
              0,

            dense_score:
              candidate.dense?.similarity_score ??
              null,

            lexical_score:
              candidate.lexical?.lexical_score ??
              null,

            rrf_score: rrfScore,
          };
        },
      );

    return fusedResults
      .sort(
        (a, b) =>
          b.rrf_score - a.rrf_score,
      )
      .slice(0, k);
  },
};