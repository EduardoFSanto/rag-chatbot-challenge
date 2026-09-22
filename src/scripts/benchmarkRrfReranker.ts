import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { embeddingService } from "../lib/embeddings.js";
import { lexicalSearchService } from "../lib/search/lexicalSearch.js";
import { vectorStore } from "../lib/storage/vectorStore.js";
import { rerankerService } from "../lib/reranker.js";
import type { SearchResult } from "../types/index.js";

interface EvaluationQuestion {
  id: string;
  question: string;
  relevantFiles: string[];
  category: string;
  difficulty: string;
}

interface ChunkData {
  id: string;
  text: string;
  source_file: string;
  chunk_index: number;
  char_start: number;
  char_end: number;
}

interface RankedResult {
  chunk: ChunkData;
  similarity_score: number;
  dense_score: number | null;
  lexical_score: number | null;
  rrf_score: number;
}

interface Strategy {
  name: string;
  denseWeight: number;
  lexicalWeight: number;
}

interface RerankedSearchResult {
  chunk: ChunkData;
  similarity_score: number;
}

interface StrategyMetrics {
  name: string;
  recallAt5: number;
  mrrAt5: number;
  averageRank: number | null;
  found: number;
}

const DATASET_PATH = resolve(
  process.cwd(),
  "src/evaluation/datasets/rag-evaluation.json",
);

const RETRIEVAL_K = 60;
const FINAL_K = 5;
const RRF_K = 60;

const STRATEGIES: Strategy[] = [
  {
    name: "RRF 1:1",
    denseWeight: 1,
    lexicalWeight: 1,
  },
  {
    name: "RRF 1:1.5",
    denseWeight: 1,
    lexicalWeight: 1.5,
  },
  {
    name: "RRF 1:2",
    denseWeight: 1,
    lexicalWeight: 2,
  },
  {
    name: "RRF 1:3",
    denseWeight: 1,
    lexicalWeight: 3,
  },
];

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

function calculateRrfScore(
  denseRank: number | null,
  lexicalRank: number | null,
  denseWeight: number,
  lexicalWeight: number,
): number {
  let score = 0;

  if (denseRank !== null) {
    score +=
      denseWeight /
      (RRF_K + denseRank);
  }

  if (lexicalRank !== null) {
    score +=
      lexicalWeight /
      (RRF_K + lexicalRank);
  }

  return score;
}

function buildRrfResults(
  denseResults: RankedResult[],
  lexicalResults: RankedResult[],
  strategy: Strategy,
): RankedResult[] {
  const candidates = new Map<
    string,
    {
      dense: RankedResult | null;
      lexical: RankedResult | null;
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

  return Array.from(candidates.values())
    .map((candidate) => {
      const base =
        candidate.dense ??
        candidate.lexical;

      if (!base) {
        throw new Error(
          "Candidato sem resultado dense ou lexical.",
        );
      }

      const rrfScore =
        calculateRrfScore(
          candidate.denseRank,
          candidate.lexicalRank,
          strategy.denseWeight,
          strategy.lexicalWeight,
        );

      return {
        chunk: base.chunk,
        similarity_score:
          candidate.dense
            ?.similarity_score ??
          candidate.lexical
            ?.similarity_score ??
          0,

        dense_score:
          candidate.dense
            ?.similarity_score ??
          null,

        lexical_score:
          candidate.lexical
            ?.similarity_score ??
          null,

        rrf_score: rrfScore,
      };
    })
    .sort(
      (a, b) =>
        b.rrf_score - a.rrf_score,
    )
    .slice(0, RETRIEVAL_K);
}

function toRerankerCandidates(
  results: RankedResult[],
): SearchResult[] {
  return results.map((result) => ({
    chunk: {
      ...result.chunk,
      embedding: [],
    },

    similarity_score:
      result.similarity_score,
  }));
}

function applyRerankerRanking(
  rerankedResults: RerankedSearchResult[],
  strategyResults: RankedResult[],
): RankedResult[] {
  const strategyById = new Map(
    strategyResults.map((result) => [
      result.chunk.id,
      result,
    ]),
  );

  return rerankedResults
    .filter((result) =>
      strategyById.has(result.chunk.id),
    )
    .slice(0, FINAL_K)
    .map((result) => {
      const original =
        strategyById.get(
          result.chunk.id,
        );

      if (!original) {
        throw new Error(
          `Candidato ${result.chunk.id} não encontrado na estratégia.`,
        );
      }

      return {
        chunk: result.chunk,

        similarity_score:
          result.similarity_score,

        dense_score:
          original.dense_score,

        lexical_score:
          original.lexical_score,

        rrf_score:
          original.rrf_score,
      };
    });
}

function calculateStrategyMetrics(
  questions: EvaluationQuestion[],
  resultsByQuestion: Map<
    string,
    RankedResult[]
  >,
): StrategyMetrics {
  let found = 0;
  let reciprocalRankSum = 0;
  let rankSum = 0;

  for (const question of questions) {
    const results =
      resultsByQuestion.get(
        question.id,
      ) ?? [];

    const rank = findRank(
      results,
      question.relevantFiles,
    );

    if (rank !== null) {
      found++;

      reciprocalRankSum += 1 / rank;
      rankSum += rank;
    }
  }

  return {
    name: "",
    recallAt5: found / questions.length,
    mrrAt5:
      reciprocalRankSum /
      questions.length,
    averageRank:
      found > 0
        ? rankSum / found
        : null,
    found,
  };
}

async function loadDataset(): Promise<
  EvaluationQuestion[]
> {
  const raw = await readFile(
    DATASET_PATH,
    "utf8",
  );

  return JSON.parse(
    raw,
  ) as EvaluationQuestion[];
}

async function main(): Promise<void> {
  console.log(
    "==============================================",
  );
  console.log(
    "RRF + RERANKER BENCHMARK",
  );
  console.log(
    "==============================================",
  );
  console.log(
    `Retrieval K: ${RETRIEVAL_K}`,
  );
  console.log(
    `Final K: ${FINAL_K}`,
  );
  console.log(
    `RRF K: ${RRF_K}`,
  );
  console.log(
    `Estratégias: ${STRATEGIES.length}`,
  );
  console.log();

  const questions =
    await loadDataset();

  console.log(
    `Dataset: ${questions.length} perguntas`,
  );
  console.log();

  const strategyResults = new Map<
    string,
    Map<string, RankedResult[]>
  >();

  for (const strategy of STRATEGIES) {
    strategyResults.set(
      strategy.name,
      new Map(),
    );
  }

  const startTime = Date.now();

  /*
   * ============================================================
   * ETAPA 1
   *
   * Executamos Dense + Lexical apenas uma vez por pergunta.
   * ============================================================
   */

  for (
    let questionIndex = 0;
    questionIndex < questions.length;
    questionIndex++
  ) {
    const question =
      questions[questionIndex];

    console.log(
      `[${questionIndex + 1}/${questions.length}] ${question.id}`,
    );
    console.log(
      `  ${question.question}`,
    );

    try {
      const embedding =
        await embeddingService.generate(
          question.question,
        );

      const [
        denseResults,
        lexicalResults,
      ] = await Promise.all([
        vectorStore.search(
          embedding,
          RETRIEVAL_K,
          0,
        ),

        lexicalSearchService.search(
          question.question,
          RETRIEVAL_K,
        ),
      ]);

      /*
       * ========================================================
       * ETAPA 2
       *
       * Criamos as quatro estratégias RRF.
       * ========================================================
       */

      for (const strategy of STRATEGIES) {
        const dense: RankedResult[] =
          denseResults.map(
            (result) => ({
              chunk: {
                id: result.chunk.id,
                text: result.chunk.text,
                source_file:
                  result.chunk.source_file,
                chunk_index:
                  result.chunk.chunk_index,
                char_start:
                  result.chunk.char_start,
                char_end:
                  result.chunk.char_end,
              },

              similarity_score:
                result.similarity_score,

              dense_score:
                result.similarity_score,

              lexical_score:
                null,

              rrf_score: 0,
            }),
          );

        const lexical: RankedResult[] =
  lexicalResults.map(
    (result) => ({
      chunk: {
        id: result.chunk.id,
        text: result.chunk.text,
        source_file:
          result.chunk.source_file,
        chunk_index:
          result.chunk.chunk_index,
        char_start:
          result.chunk.char_start,
        char_end:
          result.chunk.char_end,
      },

      similarity_score:
        result.lexical_score,

      dense_score:
        null,

      lexical_score:
        result.lexical_score,

      rrf_score: 0,
    }),
  );
        const fused =
          buildRrfResults(
            dense,
            lexical,
            strategy,
          );

        strategyResults
          .get(strategy.name)!
          .set(
            question.id,
            fused,
          );
      }

      /*
       * ========================================================
       * ETAPA 3
       *
       * União de todos os candidatos das quatro estratégias.
       *
       * O reranker é executado uma única vez por pergunta.
       * ========================================================
       */

      const mergedMap = new Map<
        string,
        RankedResult
      >();

      for (const strategy of STRATEGIES) {
        const results =
          strategyResults
            .get(strategy.name)!
            .get(question.id) ??
          [];

        for (const result of results) {
          if (
            !mergedMap.has(
              result.chunk.id,
            )
          ) {
            mergedMap.set(
              result.chunk.id,
              result,
            );
          }
        }
      }

      const mergedCandidates =
        Array.from(
          mergedMap.values(),
        );

      console.log(
        `  Candidatos únicos para reranker: ${mergedCandidates.length}`,
      );

      /*
       * ========================================================
       * ETAPA 4
       *
       * Adaptação para SearchResult.
       *
       * O tipo SearchResult exige embedding.
       * O reranker não precisa desse embedding, então
       * utilizamos um vetor vazio apenas para satisfazer
       * o contrato de tipo.
       * ========================================================
       */

      const rerankerCandidates =
        toRerankerCandidates(
          mergedCandidates,
        );

      /*
       * ========================================================
       * ETAPA 5
       *
       * Rerank UMA única vez.
       * ========================================================
       */

      const reranked =
        await rerankerService.rerank(
          question.question,
          rerankerCandidates,
        );

      const rerankedResults: RerankedSearchResult[] =
        reranked.map(
          (result) => ({
            chunk: {
              id: result.chunk.id,
              text: result.chunk.text,
              source_file:
                result.chunk.source_file,
              chunk_index:
                result.chunk.chunk_index,
              char_start:
                result.chunk.char_start,
              char_end:
                result.chunk.char_end,
            },

            similarity_score:
              result.similarity_score,
          }),
        );

      /*
       * ========================================================
       * ETAPA 6
       *
       * Para cada estratégia:
       *
       * Reranker global
       *       ↓
       * filtra candidatos daquela estratégia
       *       ↓
       * pega Top 5
       * ========================================================
       */

      for (const strategy of STRATEGIES) {
        const results =
          strategyResults
            .get(strategy.name)!
            .get(question.id) ??
          [];

        const finalResults =
          applyRerankerRanking(
            rerankedResults,
            results,
          );

        strategyResults
          .get(strategy.name)!
          .set(
            question.id,
            finalResults,
          );
      }

      /*
       * ========================================================
       * MOSTRA O RESULTADO DA PERGUNTA
       * ========================================================
       */

      for (const strategy of STRATEGIES) {
        const results =
          strategyResults
            .get(strategy.name)!
            .get(question.id) ??
          [];

        const rank = findRank(
          results,
          question.relevantFiles,
        );

        console.log(
          `  ${strategy.name}: ${rank ? `#${rank}` : "-"}`,
        );
      }

      console.log();
    } catch (error) {
      console.error(
        `  ERRO em ${question.id}:`,
        error,
      );

      console.log();
    }
  }

  /*
   * ============================================================
   * RESULTADOS FINAIS
   * ============================================================
   */

  console.log();
  console.log(
    "==============================================",
  );
  console.log(
    "RESULTADOS — RRF + RERANKER",
  );
  console.log(
    "==============================================",
  );

  const metrics: StrategyMetrics[] =
    [];

  for (const strategy of STRATEGIES) {
    const results =
      strategyResults.get(
        strategy.name,
      )!;

    const metric =
      calculateStrategyMetrics(
        questions,
        results,
      );

    metric.name =
      strategy.name;

    metrics.push(metric);
  }

  for (const metric of metrics) {
    console.log();
    console.log(
      metric.name,
    );

    console.log(
      `Recall@5: ${metric.found}/${questions.length} (${(
        metric.recallAt5 * 100
      ).toFixed(1)}%)`,
    );

    console.log(
      `MRR@5: ${metric.mrrAt5.toFixed(4)}`,
    );

    console.log(
      `Average Rank: ${
        metric.averageRank !== null
          ? metric.averageRank.toFixed(
              2,
            )
          : "-"
      }`,
    );
  }

  /*
   * ============================================================
   * COMPARAÇÃO 1:1 VS OUTRAS ESTRATÉGIAS
   * ============================================================
   */

  console.log();
  console.log(
    "==============================================",
  );
  console.log(
    "DIFERENÇAS ENTRE ESTRATÉGIAS",
  );
  console.log(
    "==============================================",
  );

  const baseline =
    strategyResults.get(
      "RRF 1:1",
    )!;

  for (const strategy of STRATEGIES.slice(
    1,
  )) {
    const current =
      strategyResults.get(
        strategy.name,
      )!;

    console.log();
    console.log(
      `--- RRF 1:1 vs ${strategy.name} ---`,
    );

    let differences = 0;

    for (const question of questions) {
      const baselineResults =
        baseline.get(
          question.id,
        ) ?? [];

      const currentResults =
        current.get(
          question.id,
        ) ?? [];

      const baselineRank =
        findRank(
          baselineResults,
          question.relevantFiles,
        );

      const currentRank =
        findRank(
          currentResults,
          question.relevantFiles,
        );

      if (
        baselineRank !==
        currentRank
      ) {
        differences++;

        console.log(
          `${question.id}: 1:1=${
            baselineRank ??
            "-"
          } | ${
            strategy.name
          }=${
            currentRank ??
            "-"
          }`,
        );
      }
    }

    console.log(
      `Total de diferenças: ${differences}`,
    );
  }

  /*
   * ============================================================
   * TEMPO
   * ============================================================
   */

  const elapsed =
    (Date.now() -
      startTime) /
    1000;

  console.log();
  console.log(
    "==============================================",
  );
  console.log(
    `Tempo total: ${elapsed.toFixed(1)}s`,
  );
  console.log(
    `Tempo médio: ${(
      elapsed /
      questions.length
    ).toFixed(2)}s/pergunta`,
  );
  console.log(
    "==============================================",
  );
}

main().catch((error) => {
  console.error(
    "Benchmark failed:",
    error,
  );

  process.exit(1);
});