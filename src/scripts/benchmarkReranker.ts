import { QdrantClient } from "@qdrant/js-client-rest";
import { embeddingService } from "../lib/embeddings.js";
import { rerankerService } from "../lib/reranker.js";
import type { SearchResult } from "../types/index.js";

const COLLECTION_NAME = "vrtech_knowledge";

const RETRIEVAL_K = 30;
const FINAL_K = 5;

const client = new QdrantClient({
  url: process.env.QDRANT_URL || "http://localhost:6333",
});

const questions = [
  "como ajustar o estoque no etrade?",
  "contagem de estoque",
  "como fazer contagem de estoque?",
  "contagem de estoque no etrade",
  "ajustar estoque através da contagem de estoque",
  "gerar movimento de entrada e saída na contagem de estoque",
];

async function searchCandidates(
  question: string,
): Promise<SearchResult[]> {
  const queryEmbedding =
    await embeddingService.generate(question);

  const results = await client.query(
    COLLECTION_NAME,
    {
      query: queryEmbedding,
      limit: RETRIEVAL_K,
      score_threshold: 0,
      with_payload: true,
      with_vector: true,
    },
  );

  return results.points.map((result: any) => ({
    chunk: {
      id:
        result.payload?.id ??
        String(result.id),

      text:
        result.payload?.text ??
        "",

      source_file:
        result.payload?.source_file ??
        "",

      chunk_index:
        result.payload?.chunk_index ??
        0,

      char_start:
        result.payload?.char_start ??
        0,

      char_end:
        result.payload?.char_end ??
        0,

      embedding:
        result.vector ?? [],
    },

    similarity_score:
      Number(result.score),
  }));
}

function printResults(
  title: string,
  results: SearchResult[],
) {
  console.log(`\n${title}`);
  console.log("========================================");

  results.forEach((result, index) => {
    console.log(
      `\n#${index + 1} | score=${result.similarity_score.toFixed(4)}`,
    );

    console.log(
      `arquivo: ${result.chunk.source_file}`,
    );

    console.log(
      `chunk: ${result.chunk.chunk_index}`,
    );

    const text = result.chunk.text
      .replace(/\s+/g, " ")
      .trim();

    console.log(
      text.substring(0, 350),
    );
  });
}

async function main() {
  console.log("\n========================================");
  console.log("BENCHMARK DO RERANKER");
  console.log("========================================");

  console.log(
    `Coleção: ${COLLECTION_NAME}`,
  );

  console.log(
    `Retrieval K: ${RETRIEVAL_K}`,
  );

  console.log(
    `Final K: ${FINAL_K}`,
  );

  for (const question of questions) {
    console.log("\n\n========================================");
    console.log(`PERGUNTA: ${question}`);
    console.log("========================================");

    console.log(
      "\nBuscando candidatos no Qdrant...",
    );

    const candidates =
      await searchCandidates(question);

    printResults(
      `TOP ${RETRIEVAL_K} — QDRANT`,
      candidates,
    );

    console.log(
      "\nExecutando reranking...",
    );

    const reranked =
      await rerankerService.rerank(
        question,
        candidates,
      );

    const finalResults =
      reranked.slice(0, FINAL_K);

    printResults(
      `TOP ${FINAL_K} — APÓS RERANKING`,
      finalResults,
    );
  }

  console.log("\n========================================");
  console.log("BENCHMARK FINALIZADO");
  console.log("========================================");
}

main().catch((error) => {
  console.error("\nBenchmark failed:");
  console.error(error);
  process.exit(1);
});
