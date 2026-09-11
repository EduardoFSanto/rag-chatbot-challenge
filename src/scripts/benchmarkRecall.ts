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

interface BenchmarkQuestion {
  question: string;
  expectedFiles: string[];
}

const questions: BenchmarkQuestion[] = [
  {
    question: "como ajustar o estoque no etrade?",
    expectedFiles: [
      "Contagem de estoquepor seleçõescomo classe, sub,marca, etc....transcript.txt",
      "Web - Contagem de estoque com leitor de código pelo celular.transcript.txt",
      "Contar estoque utilizando celular.transcript.txt",
    ],
  },
  {
    question: "contagem de estoque",
    expectedFiles: [
      "Contagem de estoquepor seleçõescomo classe, sub,marca, etc....transcript.txt",
      "Web - Contagem de estoque com leitor de código pelo celular.transcript.txt",
      "Contar estoque utilizando celular.transcript.txt",
    ],
  },
  {
    question: "como fazer contagem de estoque?",
    expectedFiles: [
      "Contagem de estoquepor seleçõescomo classe, sub,marca, etc....transcript.txt",
      "Web - Contagem de estoque com leitor de código pelo celular.transcript.txt",
      "Contar estoque utilizando celular.transcript.txt",
    ],
  },
  {
    question: "contagem de estoque no etrade",
    expectedFiles: [
      "Contagem de estoquepor seleçõescomo classe, sub,marca, etc....transcript.txt",
      "Web - Contagem de estoque com leitor de código pelo celular.transcript.txt",
      "Contar estoque utilizando celular.transcript.txt",
    ],
  },
  {
    question: "ajustar estoque através da contagem de estoque",
    expectedFiles: [
      "Contagem de estoquepor seleçõescomo classe, sub,marca, etc....transcript.txt",
      "Web - Contagem de estoque com leitor de código pelo celular.transcript.txt",
      "Contar estoque utilizando celular.transcript.txt",
    ],
  },
  {
    question: "gerar movimento de entrada e saída na contagem de estoque",
    expectedFiles: [
      "Gerar movimento entrada e saída na contagem de estoque.transcript.txt",
      "Contagem de estoquepor seleçõescomo classe, sub,marca, etc....transcript.txt",
    ],
  },
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
      with_vector: false,
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

      embedding: [],
    },

    similarity_score:
      Number(result.score),
  }));
}

function normalizeFilename(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[áàãâä]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i")
    .replace(/[óòõôö]/g, "o")
    .replace(/[úùûü]/g, "u")
    .replace(/ç/g, "c");
}

function isExpectedFile(
  filename: string,
  expectedFiles: string[],
): boolean {
  const normalizedFilename =
    normalizeFilename(filename);

  return expectedFiles.some(
    (expectedFile) =>
      normalizedFilename ===
      normalizeFilename(expectedFile),
  );
}

function findRank(
  results: SearchResult[],
  expectedFiles: string[],
): number | null {
  const index = results.findIndex((result) =>
    isExpectedFile(
      result.chunk.source_file,
      expectedFiles,
    ),
  );

  return index === -1 ? null : index + 1;
}

function printRetrievalSummary(
  results: SearchResult[],
  expectedFiles: string[],
) {
  const rank = findRank(
    results,
    expectedFiles,
  );

  if (rank === null) {
    console.log(
      `❌ Documento esperado NÃO encontrado no Top ${RETRIEVAL_K}`,
    );
  } else {
    console.log(
      `📌 Melhor documento esperado no Qdrant: posição #${rank}`,
    );
  }
}

function printRerankerSummary(
  results: SearchResult[],
  expectedFiles: string[],
) {
  const rank = findRank(
    results,
    expectedFiles,
  );

  if (rank === null) {
    console.log(
      `❌ Documento esperado NÃO encontrado no Top ${FINAL_K} após reranking`,
    );
  } else {
    console.log(
      `✅ Melhor documento esperado após reranking: posição #${rank}`,
    );
  }
}

function printTopResults(
  title: string,
  results: SearchResult[],
) {
  console.log(`\n${title}`);
  console.log("----------------------------------------");

  results.forEach((result, index) => {
    console.log(
      `#${index + 1} | score=${result.similarity_score.toFixed(4)} | ${result.chunk.source_file} | chunk=${result.chunk.chunk_index}`,
    );
  });
}

async function main() {
  console.log("\n========================================");
  console.log("BENCHMARK RECALL + RERANKER");
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

  let retrievalSuccess = 0;
  let rerankerSuccess = 0;

  for (const benchmark of questions) {
    console.log("\n\n========================================");
    console.log(
      `PERGUNTA: ${benchmark.question}`,
    );
    console.log("========================================");

    console.log(
      "\nBuscando candidatos no Qdrant...",
    );

    const candidates =
      await searchCandidates(
        benchmark.question,
      );

    printRetrievalSummary(
      candidates,
      benchmark.expectedFiles,
    );

    printTopResults(
      `TOP ${RETRIEVAL_K} — QDRANT`,
      candidates.slice(0, 10),
    );

    const retrievalRank = findRank(
      candidates,
      benchmark.expectedFiles,
    );

    if (retrievalRank !== null) {
      retrievalSuccess++;
    }

    console.log(
      "\nExecutando reranking...",
    );

    const reranked =
      await rerankerService.rerank(
        benchmark.question,
        candidates,
      );

    const finalResults =
      reranked.slice(0, FINAL_K);

    printRerankerSummary(
      finalResults,
      benchmark.expectedFiles,
    );

    printTopResults(
      `TOP ${FINAL_K} — RERANKER`,
      finalResults,
    );

    const rerankerRank = findRank(
      finalResults,
      benchmark.expectedFiles,
    );

    if (rerankerRank !== null) {
      rerankerSuccess++;
    }
  }

  console.log("\n\n========================================");
  console.log("RESULTADO FINAL");
  console.log("========================================");

  console.log(
    `Recall@${RETRIEVAL_K}: ${retrievalSuccess}/${questions.length} (${((retrievalSuccess / questions.length) * 100).toFixed(1)}%)`,
  );

  console.log(
    `Recall@${FINAL_K} após reranking: ${rerankerSuccess}/${questions.length} (${((rerankerSuccess / questions.length) * 100).toFixed(1)}%)`,
  );

  console.log("\n========================================");
  console.log("BENCHMARK FINALIZADO");
  console.log("========================================");
}

main().catch((error) => {
  console.error("\nBenchmark failed:");
  console.error(error);
  process.exit(1);
});

