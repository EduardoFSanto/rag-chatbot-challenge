import { hybridSearchService } from "../lib/search/hybridSearch.js";
import { rerankerService } from "../lib/reranker.js";

import type { SearchResult } from "../types/index.js";

const RETRIEVAL_K = 30;
const FINAL_K = 5;

/**
 * Quantas perguntas serão executadas neste benchmark.
 *
 * 1 = teste seguro com apenas uma pergunta.
 * 6 = benchmark completo.
 */
const BENCHMARK_LIMIT = 6;

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
    question:
      "gerar movimento de entrada e saída na contagem de estoque",
    expectedFiles: [
      "Gerar movimento entrada e saída na contagem de estoque.transcript.txt",
      "Contagem de estoquepor seleções como classe, sub,marca, etc....transcript.txt",
    ],
  },
];

const benchmarkQuestions = questions.slice(
  0,
  Math.min(BENCHMARK_LIMIT, questions.length),
);

function normalizeFilename(filename: string): string {
  return filename
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
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

function printHybridResults(
  results: Awaited<
    ReturnType<typeof hybridSearchService.search>
  >,
): void {
  results.slice(0, 10).forEach(
    (result, index) => {
      console.log(
        `#${index + 1} | RRF=${result.rrf_score.toFixed(
          6,
        )} | dense=${
          result.dense_score === null
            ? "-"
            : result.dense_score.toFixed(4)
        } | lexical=${
          result.lexical_score === null
            ? "-"
            : result.lexical_score.toFixed(4)
        } | ${result.chunk.source_file} | chunk=${result.chunk.chunk_index}`,
      );
    },
  );
}

function printRerankedResults(
  results: SearchResult[],
  expectedFiles: string[],
): void {
  results.slice(0, FINAL_K).forEach(
    (result, index) => {
      const expected = isExpectedFile(
        result.chunk.source_file,
        expectedFiles,
      );

      console.log(
        `#${index + 1} | reranker=${result.similarity_score.toFixed(
          4,
        )} | ${
          expected ? "✅ ESPERADO" : "❌"
        } | ${result.chunk.source_file} | chunk=${result.chunk.chunk_index}`,
      );

      const text = result.chunk.text
        .replace(/\s+/g, " ")
        .trim();

      console.log(
        `   ${text.substring(0, 250)}`,
      );
    },
  );
}

async function main(): Promise<void> {
  console.log(
    "\n========================================",
  );

  console.log(
    "BENCHMARK HYBRID SEARCH + RERANKER",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Perguntas configuradas: ${questions.length}`,
  );

  console.log(
    `Perguntas executadas: ${benchmarkQuestions.length}`,
  );

  console.log(
    `Retrieval K: ${RETRIEVAL_K}`,
  );

  console.log(
    `Final K: ${FINAL_K}`,
  );

  console.log(
    "\n⚠️ Modo controlado: executando apenas",
  );

  console.log(
    `${benchmarkQuestions.length} pergunta(s).`,
  );

  let hybridRecallSuccess = 0;
  let rerankerRecallSuccess = 0;

  const reciprocalRanks: number[] = [];

  for (const benchmark of benchmarkQuestions) {
    console.log(
      "\n\n========================================",
    );

    console.log(
      `PERGUNTA: ${benchmark.question}`,
    );

    console.log(
      "========================================",
    );

    console.log(
      "\n1. HYBRID SEARCH",
    );

    console.log(
      "----------------------------------------",
    );

    const hybridResults =
      await hybridSearchService.search(
        benchmark.question,
        RETRIEVAL_K,
      );

    const hybridRank = findRank(
      hybridResults,
      benchmark.expectedFiles,
    );

    if (hybridRank === null) {
      console.log(
        `❌ Documento esperado NÃO encontrado no Top ${RETRIEVAL_K}`,
      );
    } else {
      console.log(
        `✅ Melhor documento esperado no Hybrid: #${hybridRank}`,
      );

      hybridRecallSuccess++;
    }

    printHybridResults(hybridResults);

    console.log(
      "\n2. RERANKER",
    );

    console.log(
      "----------------------------------------",
    );

    console.log(
      `Enviando ${hybridResults.length} candidatos para o reranker...`,
    );

    const rerankedResults =
      await rerankerService.rerank(
        benchmark.question,
        hybridResults,
      );

    const finalResults =
      rerankedResults.slice(0, FINAL_K);

    const rerankerRank = findRank(
      finalResults,
      benchmark.expectedFiles,
    );

    if (rerankerRank === null) {
      console.log(
        `❌ Documento esperado NÃO encontrado no Top ${FINAL_K} após reranking`,
      );
    } else {
      console.log(
        `✅ Melhor documento esperado após reranking: #${rerankerRank}`,
      );

      rerankerRecallSuccess++;

      reciprocalRanks.push(
        1 / rerankerRank,
      );
    }

    printRerankedResults(
      finalResults,
      benchmark.expectedFiles,
    );
  }

  const totalQuestions =
    benchmarkQuestions.length;

  const hybridRecall =
    totalQuestions === 0
      ? 0
      : hybridRecallSuccess / totalQuestions;

  const rerankerRecall =
    totalQuestions === 0
      ? 0
      : rerankerRecallSuccess / totalQuestions;

  const mrr =
    totalQuestions === 0
      ? 0
      : reciprocalRanks.reduce(
          (sum, value) => sum + value,
          0,
        ) / totalQuestions;

  console.log(
    "\n\n========================================",
  );

  console.log(
    "RESULTADO FINAL",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Hybrid Recall@${RETRIEVAL_K}: ${hybridRecallSuccess}/${totalQuestions} (${(
      hybridRecall * 100
    ).toFixed(1)}%)`,
  );

  console.log(
    `Reranker Recall@${FINAL_K}: ${rerankerRecallSuccess}/${totalQuestions} (${(
      rerankerRecall * 100
    ).toFixed(1)}%)`,
  );

  console.log(
    `MRR@${FINAL_K}: ${mrr.toFixed(4)}`,
  );

  console.log(
    "\n========================================",
  );

  console.log(
    "BENCHMARK FINALIZADO",
  );

  console.log(
    "========================================",
  );
}

main().catch((error) => {
  console.error(
    "\nBenchmark failed:",
  );

  console.error(error);

  process.exit(1);
});