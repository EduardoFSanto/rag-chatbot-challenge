import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { embeddingService } from "../lib/embeddings.js";
import { lexicalSearchService } from "../lib/search/lexicalSearch.js";
import { hybridSearchService } from "../lib/search/hybridSearch.js";
import { vectorStore } from "../lib/storage/vectorStore.js";

interface EvaluationQuestion {
  id: string;
  question: string;
  relevantFiles: string[];
  category: string;
  difficulty: string;
}

interface RankedResult {
  source_file: string;
  chunk_index: number;
  rank: number | null;
  score: number | null;
}

interface SearchDiagnostic {
  dense: RankedResult;
  lexical: RankedResult;
  hybrid: RankedResult;
}

interface KMetrics {
  k: number;
  denseFound: number;
  lexicalFound: number;
  hybridFound: number;
  total: number;
}

const K_VALUES = [10, 20, 30, 40, 50, 60];

const DATASET_PATH = resolve(
  process.cwd(),
  "src/evaluation/datasets/rag-evaluation.json",
);

const DENSE_THRESHOLD = 0;

function normalizeFilename(filename: string): string {
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

  return index === -1 ? null : index + 1;
}

async function loadDataset(): Promise<
  EvaluationQuestion[]
> {
  const raw = await readFile(
    DATASET_PATH,
    "utf-8",
  );

  const dataset = JSON.parse(raw) as unknown;

  if (!Array.isArray(dataset)) {
    throw new Error(
      "Dataset inválido: o arquivo precisa conter um array de perguntas.",
    );
  }

  const questions = dataset as EvaluationQuestion[];

  if (questions.length === 0) {
    throw new Error(
      "Dataset vazio: nenhuma pergunta encontrada.",
    );
  }

  for (const question of questions) {
    if (
      !question.id ||
      !question.question ||
      !Array.isArray(question.relevantFiles) ||
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

async function denseSearch(
  question: string,
  k: number,
) {
  const embedding =
    await embeddingService.generate(question);

  return vectorStore.search(
    embedding,
    k,
    DENSE_THRESHOLD,
  );
}

function createRankedResult(
  result:
    | {
        chunk: {
          source_file: string;
          chunk_index: number;
        };
        similarity_score?: number;
        lexical_score?: number;
        rrf_score?: number;
      }
    | undefined,
  rank: number | null,
): RankedResult {
  if (!result) {
    return {
      source_file: "",
      chunk_index: 0,
      rank,
      score: null,
    };
  }

  return {
    source_file: result.chunk.source_file,
    chunk_index: result.chunk.chunk_index,
    rank,
    score:
      result.similarity_score ??
      result.lexical_score ??
      result.rrf_score ??
      null,
  };
}

async function runQuestion(
  benchmark: EvaluationQuestion,
  maxK: number,
): Promise<SearchDiagnostic> {
  /*
   * Generate embedding only once for this question.
   */
  const embedding =
    await embeddingService.generate(
      benchmark.question,
    );

  /*
   * Dense search.
   */
  const denseResults =
    await vectorStore.search(
      embedding,
      maxK,
      DENSE_THRESHOLD,
    );

  /*
   * Lexical search.
   */
  const lexicalResults =
    await lexicalSearchService.search(
      benchmark.question,
      maxK,
    );

  /*
   * Hybrid search.
   *
   * This calls the existing Hybrid Search implementation,
   * which internally performs its own dense embedding generation.
   *
   * This is intentional for the first diagnostic version:
   * we are measuring the real production Hybrid implementation.
   */
  const hybridResults =
    await hybridSearchService.search(
      benchmark.question,
      maxK,
    );

  const denseRank = findRank(
    denseResults,
    benchmark.relevantFiles,
  );

  const lexicalRank = findRank(
    lexicalResults,
    benchmark.relevantFiles,
  );

  const hybridRank = findRank(
    hybridResults,
    benchmark.relevantFiles,
  );

  return {
    dense: createRankedResult(
      denseRank !== null
        ? denseResults[denseRank - 1]
        : undefined,
      denseRank,
    ),

    lexical: createRankedResult(
      lexicalRank !== null
        ? lexicalResults[lexicalRank - 1]
        : undefined,
      lexicalRank,
    ),

    hybrid: createRankedResult(
      hybridRank !== null
        ? hybridResults[hybridRank - 1]
        : undefined,
      hybridRank,
    ),
  };
}

function calculateMetrics(
  diagnostics: Array<{
    denseRank: number | null;
    lexicalRank: number | null;
    hybridRank: number | null;
  }>,
  k: number,
): KMetrics {
  const denseFound = diagnostics.filter(
    (item) =>
      item.denseRank !== null &&
      item.denseRank <= k,
  ).length;

  const lexicalFound = diagnostics.filter(
    (item) =>
      item.lexicalRank !== null &&
      item.lexicalRank <= k,
  ).length;

  const hybridFound = diagnostics.filter(
    (item) =>
      item.hybridRank !== null &&
      item.hybridRank <= k,
  ).length;

  return {
    k,
    denseFound,
    lexicalFound,
    hybridFound,
    total: diagnostics.length,
  };
}

function percentage(
  value: number,
  total: number,
): string {
  if (total === 0) {
    return "0.0%";
  }

  return `${(
    (value / total) *
    100
  ).toFixed(1)}%`;
}

function printMetrics(
  metrics: KMetrics[],
): void {
  console.log(
    "\n============================================================",
  );

  console.log(
    "RECALL POR K",
  );

  console.log(
    "============================================================",
  );

  console.log(
    "K".padEnd(8) +
      "Dense".padEnd(14) +
      "Lexical".padEnd(14) +
      "Hybrid".padEnd(14),
  );

  console.log(
    "------------------------------------------------------------",
  );

  for (const metric of metrics) {
    console.log(
      String(metric.k).padEnd(8) +
        `${metric.denseFound}/${metric.total} (${percentage(
          metric.denseFound,
          metric.total,
        )})`.padEnd(14) +
        `${metric.lexicalFound}/${metric.total} (${percentage(
          metric.lexicalFound,
          metric.total,
        )})`.padEnd(14) +
        `${metric.hybridFound}/${metric.total} (${percentage(
          metric.hybridFound,
          metric.total,
        )})`.padEnd(14),
    );
  }
}

function printDetailedComparison(
  questions: EvaluationQuestion[],
  diagnostics: SearchDiagnostic[],
): void {
  console.log(
    "\n============================================================",
  );

  console.log(
    "COMPARAÇÃO DETALHADA",
  );

  console.log(
    "============================================================",
  );

  for (
    let index = 0;
    index < questions.length;
    index++
  ) {
    const question = questions[index];
    const diagnostic = diagnostics[index];

    console.log(
      `\n${question.id} | ${question.category} | ${question.difficulty}`,
    );

    console.log(
      `Pergunta: ${question.question}`,
    );

    console.log(
      `Dense:   ${
        diagnostic.dense.rank === null
          ? "NÃO ENCONTRADO"
          : `#${diagnostic.dense.rank}`
      }`,
    );

    console.log(
      `Lexical: ${
        diagnostic.lexical.rank === null
          ? "NÃO ENCONTRADO"
          : `#${diagnostic.lexical.rank}`
      }`,
    );

    console.log(
      `Hybrid:  ${
        diagnostic.hybrid.rank === null
          ? "NÃO ENCONTRADO"
          : `#${diagnostic.hybrid.rank}`
      }`,
    );

    if (
      diagnostic.dense.rank !== null &&
      diagnostic.lexical.rank !== null &&
      diagnostic.hybrid.rank !== null
    ) {
      console.log(
        "Resultado: encontrado pelos 3 métodos",
      );
    } else if (
      diagnostic.hybrid.rank !== null
    ) {
      console.log(
        "Resultado: Hybrid encontrou, mas pelo menos um método individual não encontrou",
      );
    } else {
      console.log(
        "Resultado: Hybrid NÃO encontrou no K máximo",
      );
    }
  }
}

function printFailureClassification(
  questions: EvaluationQuestion[],
  diagnostics: SearchDiagnostic[],
): void {
  const hybridFailures: EvaluationQuestion[] = [];
  const denseOnlyFailures: EvaluationQuestion[] = [];
  const lexicalOnlyFailures: EvaluationQuestion[] = [];
  const hybridRescued: EvaluationQuestion[] = [];

  for (
    let index = 0;
    index < questions.length;
    index++
  ) {
    const question = questions[index];
    const diagnostic = diagnostics[index];

    const denseFound =
      diagnostic.dense.rank !== null &&
      diagnostic.dense.rank <= Math.max(
        ...K_VALUES,
      );

    const lexicalFound =
      diagnostic.lexical.rank !== null &&
      diagnostic.lexical.rank <= Math.max(
        ...K_VALUES,
      );

    const hybridFound =
      diagnostic.hybrid.rank !== null &&
      diagnostic.hybrid.rank <= Math.max(
        ...K_VALUES,
      );

    if (!hybridFound) {
      hybridFailures.push(question);
    }

    if (denseFound && !lexicalFound) {
      denseOnlyFailures.push(question);
    }

    if (lexicalFound && !denseFound) {
      lexicalOnlyFailures.push(question);
    }

    if (
      hybridFound &&
      !denseFound &&
      lexicalFound
    ) {
      hybridRescued.push(question);
    }
  }

  console.log(
    "\n============================================================",
  );

  console.log(
    "DIAGNÓSTICO DE COBERTURA",
  );

  console.log(
    "============================================================",
  );

  console.log(
    `Hybrid não encontrou: ${hybridFailures.length}`,
  );

  console.log(
    `Encontrado apenas pelo Dense: ${denseOnlyFailures.length}`,
  );

  console.log(
    `Encontrado apenas pelo Lexical: ${lexicalOnlyFailures.length}`,
  );

  console.log(
    `Hybrid encontrou combinação: ${hybridRescued.length}`,
  );

  if (hybridFailures.length > 0) {
    console.log(
      "\nPerguntas que o Hybrid não encontrou:",
    );

    for (const question of hybridFailures) {
      console.log(
        `  - ${question.id}: ${question.question}`,
      );
    }
  }
}

async function main() {
  const questions =
    await loadDataset();

  const maxK = Math.max(...K_VALUES);

  console.log(
    "\n============================================================",
  );

  console.log(
    "BENCHMARK DIAGNÓSTICO DE RETRIEVAL",
  );

  console.log(
    "============================================================",
  );

  console.log(
    `Dataset: ${DATASET_PATH}`,
  );

  console.log(
    `Perguntas: ${questions.length}`,
  );

  console.log(
    `K avaliados: ${K_VALUES.join(", ")}`,
  );

  console.log(
    `Dense threshold: ${DENSE_THRESHOLD}`,
  );

  console.log(
    "\nMétodos:",
  );

  console.log(
    "  1. Dense — Qdrant + embeddings",
  );

  console.log(
    "  2. Lexical — PostgreSQL FTS",
  );

  console.log(
    "  3. Hybrid — Dense + Lexical + RRF",
  );

  console.log(
    "\n============================================================\n",
  );

  const diagnostics: SearchDiagnostic[] = [];

  const startTime = Date.now();

  for (
    let index = 0;
    index < questions.length;
    index++
  ) {
    const question = questions[index];

    console.log(
      `[${String(index + 1).padStart(
        3,
        "0",
      )}/${questions.length}] ${question.id} | ${question.question}`,
    );

    try {
      const diagnostic =
        await runQuestion(
          question,
          maxK,
        );

      diagnostics.push(diagnostic);

      console.log(
        `  Dense=${diagnostic.dense.rank ?? "-"} | Lexical=${diagnostic.lexical.rank ?? "-"} | Hybrid=${diagnostic.hybrid.rank ?? "-"}`,
      );
    } catch (error) {
      console.error(
        `  ERRO: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );

      diagnostics.push({
        dense: {
          source_file: "",
          chunk_index: 0,
          rank: null,
          score: null,
        },

        lexical: {
          source_file: "",
          chunk_index: 0,
          rank: null,
          score: null,
        },

        hybrid: {
          source_file: "",
          chunk_index: 0,
          rank: null,
          score: null,
        },
      });
    }
  }

  const elapsedSeconds =
    (Date.now() - startTime) / 1000;

  /*
   * Build Recall@K metrics from the recorded ranks.
   */
  const metrics = K_VALUES.map((k) =>
    calculateMetrics(
      diagnostics.map((diagnostic) => ({
        denseRank: diagnostic.dense.rank,
        lexicalRank:
          diagnostic.lexical.rank,
        hybridRank:
          diagnostic.hybrid.rank,
      })),
      k,
    ),
  );

  printMetrics(metrics);

  printFailureClassification(
    questions,
    diagnostics,
  );

  /*
   * Detailed output is intentionally printed after
   * the summary so the most important information is
   * immediately visible in the terminal.
   */
  printDetailedComparison(
    questions,
    diagnostics,
  );

  console.log(
    "\n============================================================",
  );

  console.log(
    "BENCHMARK FINALIZADO",
  );

  console.log(
    "============================================================",
  );

  console.log(
    `Tempo total: ${elapsedSeconds.toFixed(1)}s`,
  );

  console.log(
    `Tempo médio por pergunta: ${(
      elapsedSeconds / questions.length
    ).toFixed(2)}s`,
  );

  console.log();
}

main().catch((error) => {
  console.error(
    "\nBenchmark failed:",
  );

  console.error(error);

  process.exit(1);
});
