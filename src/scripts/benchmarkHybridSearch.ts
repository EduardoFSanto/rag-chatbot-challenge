import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { hybridSearchService } from "../lib/search/hybridSearch.js";
import { rerankerService } from "../lib/reranker.js";

interface EvaluationQuestion {
  id: string;
  question: string;
  relevantFiles: string[];
  category: string;
  difficulty: string;
}

const RETRIEVAL_K = 30;
const FINAL_K = 5;

const DATASET_PATH = resolve(
  process.cwd(),
  "src/evaluation/datasets/rag-evaluation.json",
);

function normalizeFilename(
  filename: string,
): string {
  return filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
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
  results: Array<{
    chunk: {
      source_file: string;
    };
  }>,
  expectedFiles: string[],
): number | null {
  const index = results.findIndex((result) =>
    isExpectedFile(
      result.chunk.source_file,
      expectedFiles,
    ),
  );

  return index === -1
    ? null
    : index + 1;
}

async function loadDataset(): Promise<
  EvaluationQuestion[]
> {
  const raw = await readFile(
    DATASET_PATH,
    "utf-8",
  );

  const dataset = JSON.parse(
    raw,
  ) as unknown;

  if (!Array.isArray(dataset)) {
    throw new Error(
      "Dataset inválido: o arquivo precisa conter um array de perguntas.",
    );
  }

  const questions =
    dataset as EvaluationQuestion[];

  if (questions.length === 0) {
    throw new Error(
      "Dataset vazio: nenhuma pergunta encontrada.",
    );
  }

  for (const question of questions) {
    if (
      !question.id ||
      !question.question ||
      !Array.isArray(
        question.relevantFiles,
      ) ||
      question.relevantFiles.length === 0
    ) {
      throw new Error(
        `Pergunta inválida no dataset: ${JSON.stringify(
          question,
        )}`,
      );
    }
  }

  return questions;
}

function printProgress(
  current: number,
  total: number,
  benchmark: EvaluationQuestion,
  hybridRank: number | null,
  rerankerRank: number | null,
) {
  const hybridStatus =
    hybridRank === null
      ? `H:${RETRIEVAL_K}+`
      : `H:${hybridRank}`;

  const rerankerStatus =
    rerankerRank === null
      ? `R:${FINAL_K}+`
      : `R:${rerankerRank}`;

  console.log(
    `[${String(current).padStart(
      3,
      "0",
    )}/${total}] ${benchmark.id} | ${hybridStatus} | ${rerankerStatus} | ${benchmark.category} | ${benchmark.difficulty} | ${benchmark.question}`,
  );
}

async function main() {
  const questions =
    await loadDataset();

  console.log(
    "\n========================================",
  );

  console.log(
    "BENCHMARK HYBRID SEARCH + RRF + RERANKER",
  );

  console.log(
    "========================================",
  );

  console.log(
    `Dataset: ${DATASET_PATH}`,
  );

  console.log(
    `Perguntas: ${questions.length}`,
  );

  console.log(
    `Retrieval K: ${RETRIEVAL_K}`,
  );

  console.log(
    `Final K: ${FINAL_K}`,
  );

  console.log(
    "\n----------------------------------------",
  );

  console.log(
    "EXECUTANDO BENCHMARK...",
  );

  console.log(
    "----------------------------------------\n",
  );

  let hybridSuccess = 0;
  let rerankerSuccess = 0;

  const reciprocalRanks: number[] = [];

  const hybridRanks: number[] = [];
  const rerankerRanks: number[] = [];

  const hybridFailures: EvaluationQuestion[] =
    [];

  const rerankerFailures: EvaluationQuestion[] =
    [];

  const startTime = Date.now();

  for (
    let index = 0;
    index < questions.length;
    index++
  ) {
    const benchmark = questions[index];

    /*
     * ------------------------------------------------
     * 1. HYBRID SEARCH
     * ------------------------------------------------
     */

    const hybridResults =
      await hybridSearchService.search(
        benchmark.question,
        RETRIEVAL_K,
      );

    const hybridRank = findRank(
      hybridResults,
      benchmark.relevantFiles,
    );

    if (hybridRank === null) {
      hybridFailures.push(benchmark);
    } else {
      hybridSuccess++;
      hybridRanks.push(hybridRank);
    }

    /*
     * ------------------------------------------------
     * 2. RERANKER
     * ------------------------------------------------
     */

    const rerankedResults =
      await rerankerService.rerank(
        benchmark.question,
        hybridResults,
      );

    const finalResults =
      rerankedResults.slice(0, FINAL_K);

    const rerankerRank = findRank(
      finalResults,
      benchmark.relevantFiles,
    );

    if (rerankerRank === null) {
      rerankerFailures.push(benchmark);
      reciprocalRanks.push(0);
    } else {
      rerankerSuccess++;
      rerankerRanks.push(rerankerRank);

      reciprocalRanks.push(
        1 / rerankerRank,
      );
    }

    /*
     * ------------------------------------------------
     * 3. PROGRESS
     * ------------------------------------------------
     */

    printProgress(
      index + 1,
      questions.length,
      benchmark,
      hybridRank,
      rerankerRank,
    );
  }

  /*
   * ------------------------------------------------
   * 4. METRICS
   * ------------------------------------------------
   */

  const hybridRecall =
    hybridSuccess / questions.length;

  const rerankerRecall =
    rerankerSuccess / questions.length;

  const mrr =
    reciprocalRanks.reduce(
      (sum, value) => sum + value,
      0,
    ) / questions.length;

  const elapsedSeconds =
    (Date.now() - startTime) / 1000;

  /*
   * ------------------------------------------------
   * 5. RANK STATISTICS
   * ------------------------------------------------
   */

  const averageHybridRank =
    hybridRanks.length > 0
      ? hybridRanks.reduce(
          (sum, rank) => sum + rank,
          0,
        ) / hybridRanks.length
      : null;

  const averageRerankerRank =
    rerankerRanks.length > 0
      ? rerankerRanks.reduce(
          (sum, rank) => sum + rank,
          0,
        ) / rerankerRanks.length
      : null;

  /*
   * ------------------------------------------------
   * 6. FINAL RESULT
   * ------------------------------------------------
   */

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
    `Perguntas avaliadas: ${questions.length}`,
  );

  console.log(
    `Hybrid Recall@${RETRIEVAL_K}: ${hybridSuccess}/${questions.length} (${(
      hybridRecall * 100
    ).toFixed(1)}%)`,
  );

  console.log(
    `Reranker Recall@${FINAL_K}: ${rerankerSuccess}/${questions.length} (${(
      rerankerRecall * 100
    ).toFixed(1)}%)`,
  );

  console.log(
    `MRR@${FINAL_K}: ${mrr.toFixed(4)}`,
  );

  console.log(
    `Posição média Hybrid: ${
      averageHybridRank === null
        ? "-"
        : averageHybridRank.toFixed(2)
    }`,
  );

  console.log(
    `Posição média Reranker: ${
      averageRerankerRank === null
        ? "-"
        : averageRerankerRank.toFixed(2)
    }`,
  );

  console.log(
    `Tempo total: ${elapsedSeconds.toFixed(
      1,
    )}s`,
  );

  /*
   * ------------------------------------------------
   * 7. FAILURES
   * ------------------------------------------------
   */

  console.log(
    "\n----------------------------------------",
  );

  console.log(
    "FALHAS DE RETRIEVAL",
  );

  console.log(
    "----------------------------------------",
  );

  if (hybridFailures.length === 0) {
    console.log(
      "Nenhuma falha no Hybrid.",
    );
  } else {
    hybridFailures.forEach(
      (question) => {
        console.log(
          `${question.id} | ${question.question}`,
        );
      },
    );
  }

  console.log(
    "\n----------------------------------------",
  );

  console.log(
    `FALHAS DO RERANKER TOP ${FINAL_K}`,
  );

  console.log(
    "----------------------------------------",
  );

  if (rerankerFailures.length === 0) {
    console.log(
      "Nenhuma falha no Reranker.",
    );
  } else {
    rerankerFailures.forEach(
      (question) => {
        console.log(
          `${question.id} | ${question.question}`,
        );
      },
    );
  }

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