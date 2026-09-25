import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { embeddingService } from "../lib/embeddings.js";
import { vectorStore } from "../lib/storage/vectorStore.js";
import { lexicalSearchService } from "../lib/search/lexicalSearch.js";
import { rerankerService } from "../lib/reranker.js";

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

interface BenchmarkSearchResult {
  chunk: ChunkData;
  score: number;
}

interface HybridResult {
  chunk: ChunkData;
  similarity_score: number;
  dense_score: number | null;
  lexical_score: number | null;
  rrf_score: number;
}

interface StrategyResult {
  rank: number | null;
  score: number | null;
  chunkId: string | null;
  sourceFile: string | null;
}

interface QuestionReport {
  id: string;
  question: string;
  category: string;
  difficulty: string;
  relevantFiles: string[];

  dense: StrategyResult;
  lexical: StrategyResult;
  hybrid: StrategyResult;

  reranker: {
    rrf_1_1: StrategyResult;
    rrf_1_1_5: StrategyResult;
    rrf_1_2: StrategyResult;
    rrf_1_3: StrategyResult;
  };

  coverage: {
    denseFound: boolean;
    lexicalFound: boolean;
    hybridFound: boolean;

    rerankerFound: {
      rrf_1_1: boolean;
      rrf_1_1_5: boolean;
      rrf_1_2: boolean;
      rrf_1_3: boolean;
    };
  };

  diagnosis: string[];
}

interface BenchmarkReport {
  generatedAt: string;
  datasetSize: number;

  configuration: {
    retrievalK: number;
    rerankerFinalK: number;
    rrfK: number;

    rrfWeights: {
      "1:1": [number, number];
      "1:1.5": [number, number];
      "1:2": [number, number];
      "1:3": [number, number];
    };
  };

  summary: {
    denseRecallAt60: number;
    lexicalRecallAt60: number;
    hybridRecallAt60: number;

    rerankerRecallAt5: {
      "1:1": number;
      "1:1.5": number;
      "1:2": number;
      "1:3": number;
    };

    rerankerMRRAt5: {
      "1:1": number;
      "1:1.5": number;
      "1:2": number;
      "1:3": number;
    };

    rerankerAverageRank: {
      "1:1": number;
      "1:1.5": number;
      "1:2": number;
      "1:3": number;
    };
  };

  diagnostics: {
    denseOnly: number;
    lexicalOnly: number;
    bothDenseAndLexical: number;
    neitherDenseNorLexical: number;
    hybridMisses: number;

    rerankerMisses: {
      "1:1": number;
      "1:1.5": number;
      "1:2": number;
      "1:3": number;
    };
  };

  questions: QuestionReport[];
}

type DenseSearchResult =
  Awaited<
    ReturnType<typeof vectorStore.search>
  >[number];

type LexicalSearchResult =
  Awaited<
    ReturnType<typeof lexicalSearchService.search>
  >[number];

type RerankerSearchResult =
  Awaited<
    ReturnType<typeof rerankerService.rerank>
  >[number];

const RETRIEVAL_K = 60;
const FINAL_K = 5;
const RRF_K = 60;

const DATASET_PATH = resolve(
  process.cwd(),
  "src/evaluation/datasets/rag-evaluation.json",
);

const REPORT_DIR = resolve(
  process.cwd(),
  "src/evaluation/reports",
);

const REPORT_PATH = resolve(
  REPORT_DIR,
  "retrieval-consolidated.json",
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

function convertDenseResults(
  results: DenseSearchResult[],
): BenchmarkSearchResult[] {
  return results.map(
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
      score:
        result.similarity_score,
    }),
  );
}

function convertLexicalResults(
  results: LexicalSearchResult[],
): BenchmarkSearchResult[] {
  return results.map(
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
      score:
        result.lexical_score,
    }),
  );
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
  denseResults: BenchmarkSearchResult[],
  lexicalResults: BenchmarkSearchResult[],
  denseWeight: number,
  lexicalWeight: number,
): HybridResult[] {
  const candidates = new Map<
    string,
    {
      dense: BenchmarkSearchResult | null;
      lexical: BenchmarkSearchResult | null;
      denseRank: number | null;
      lexicalRank: number | null;
    }
  >();

  denseResults.forEach(
    (result, index) => {
      candidates.set(
        result.chunk.id,
        {
          dense: result,
          lexical: null,
          denseRank: index + 1,
          lexicalRank: null,
        },
      );
    },
  );

  lexicalResults.forEach(
    (result, index) => {
      const existing =
        candidates.get(
          result.chunk.id,
        );

      if (existing) {
        existing.lexical = result;
        existing.lexicalRank =
          index + 1;
        return;
      }

      candidates.set(
        result.chunk.id,
        {
          dense: null,
          lexical: result,
          denseRank: null,
          lexicalRank: index + 1,
        },
      );
    },
  );

  return Array.from(
    candidates.values(),
  )
    .map((candidate) => {
      const base =
        candidate.dense ??
        candidate.lexical;

      if (!base) {
        throw new Error(
          "Candidato RRF sem resultado base.",
        );
      }

      const rrfScore =
        calculateRrfScore(
          candidate.denseRank,
          candidate.lexicalRank,
          denseWeight,
          lexicalWeight,
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
        },

        similarity_score:
          candidate.dense?.score ?? 0,

        dense_score:
          candidate.dense?.score ??
          null,

        lexical_score:
          candidate.lexical?.score ??
          null,

        rrf_score:
          rrfScore,
      };
    })
    .sort(
      (a, b) =>
        b.rrf_score -
        a.rrf_score,
    )
    .slice(0, RETRIEVAL_K);
}

function findRank(
  results: BenchmarkSearchResult[],
  expectedFiles: string[],
): number | null {
  const index = results.findIndex(
    (result) =>
      isExpectedFile(
        result.chunk.source_file,
        expectedFiles,
      ),
  );

  return index === -1
    ? null
    : index + 1;
}

function findHybridRank(
  results: HybridResult[],
  expectedFiles: string[],
): number | null {
  const index = results.findIndex(
    (result) =>
      isExpectedFile(
        result.chunk.source_file,
        expectedFiles,
      ),
  );

  return index === -1
    ? null
    : index + 1;
}

function findResult(
  results: BenchmarkSearchResult[],
  expectedFiles: string[],
): BenchmarkSearchResult | null {
  return (
    results.find(
      (result) =>
        isExpectedFile(
          result.chunk.source_file,
          expectedFiles,
        ),
    ) ?? null
  );
}

function findHybridResult(
  results: HybridResult[],
  expectedFiles: string[],
): HybridResult | null {
  return (
    results.find(
      (result) =>
        isExpectedFile(
          result.chunk.source_file,
          expectedFiles,
        ),
    ) ?? null
  );
}

function createStrategyResult(
  result: BenchmarkSearchResult | null,
  rank: number | null,
): StrategyResult {
  if (!result) {
    return {
      rank,
      score: null,
      chunkId: null,
      sourceFile: null,
    };
  }

  return {
    rank,
    score: result.score,
    chunkId: result.chunk.id,
    sourceFile:
      result.chunk.source_file,
  };
}

function createHybridStrategyResult(
  result: HybridResult | null,
  rank: number | null,
): StrategyResult {
  if (!result) {
    return {
      rank,
      score: null,
      chunkId: null,
      sourceFile: null,
    };
  }

  return {
    rank,
    score: result.rrf_score,
    chunkId: result.chunk.id,
    sourceFile:
      result.chunk.source_file,
  };
}

function filterRerankerResultsForStrategy(
  rerankedResults: RerankerSearchResult[],
  strategyResults: HybridResult[],
): RerankerSearchResult[] {
  const strategyIds = new Set(
    strategyResults.map(
      (result) =>
        result.chunk.id,
    ),
  );

  return rerankedResults.filter(
    (result) =>
      strategyIds.has(
        result.chunk.id,
      ),
  );
}

function strategyFromReranker(
  results: RerankerSearchResult[],
  expectedFiles: string[],
): StrategyResult {
  const index = results.findIndex(
    (result) =>
      isExpectedFile(
        result.chunk.source_file,
        expectedFiles,
      ),
  );

  if (index === -1) {
    return {
      rank: null,
      score: null,
      chunkId: null,
      sourceFile: null,
    };
  }

  const result =
    results[index];

  return {
    rank: index + 1,
    score:
      result.similarity_score,
    chunkId: result.chunk.id,
    sourceFile:
      result.chunk.source_file,
  };
}

function diagnose(
  dense: StrategyResult,
  lexical: StrategyResult,
  hybrid: StrategyResult,
  reranker: QuestionReport["reranker"],
): string[] {
  const diagnosis: string[] = [];

  const denseFound =
    dense.rank !== null;

  const lexicalFound =
    lexical.rank !== null;

  const hybridFound =
    hybrid.rank !== null;

  if (
    !denseFound &&
    !lexicalFound
  ) {
    diagnosis.push(
      "RETRIEVAL_COVERAGE",
    );
  }

  if (
    denseFound &&
    !lexicalFound &&
    !hybridFound
  ) {
    diagnosis.push(
      "DENSE_ONLY_LOST_IN_FUSION",
    );
  }

  if (
    lexicalFound &&
    !denseFound &&
    !hybridFound
  ) {
    diagnosis.push(
      "LEXICAL_ONLY_LOST_IN_FUSION",
    );
  }

  if (
    denseFound &&
    lexicalFound &&
    !hybridFound
  ) {
    diagnosis.push(
      "BOTH_RETRIEVERS_LOST_IN_FUSION",
    );
  }

  if (
    hybridFound &&
    reranker.rrf_1_1.rank === null
  ) {
    diagnosis.push(
      "RERANKER_LOST_RRF_1_1",
    );
  }

  if (
    hybridFound &&
    reranker.rrf_1_1_5.rank === null
  ) {
    diagnosis.push(
      "RERANKER_LOST_RRF_1_1_5",
    );
  }

  if (
    hybridFound &&
    reranker.rrf_1_2.rank === null
  ) {
    diagnosis.push(
      "RERANKER_LOST_RRF_1_2",
    );
  }

  if (
    hybridFound &&
    reranker.rrf_1_3.rank === null
  ) {
    diagnosis.push(
      "RERANKER_LOST_RRF_1_3",
    );
  }

  if (diagnosis.length === 0) {
    diagnosis.push("OK");
  }

  return diagnosis;
}

function countRecall(
  results: StrategyResult[],
): number {
  return results.filter(
    (result) =>
      result.rank !== null &&
      result.rank <= FINAL_K,
  ).length;
}

function reciprocalRank(
  rank: number | null,
): number {
  if (
    rank === null ||
    rank > FINAL_K
  ) {
    return 0;
  }

  return 1 / rank;
}

function averageRank(
  results: StrategyResult[],
): number {
  const validRanks = results
    .map(
      (result) =>
        result.rank,
    )
    .filter(
      (
        rank,
      ): rank is number =>
        rank !== null &&
        rank <= FINAL_K,
    );

  if (validRanks.length === 0) {
    return 0;
  }

  return (
    validRanks.reduce(
      (sum, rank) =>
        sum + rank,
      0,
    ) / validRanks.length
  );
}

function emptyStrategyResult(): StrategyResult {
  return {
    rank: null,
    score: null,
    chunkId: null,
    sourceFile: null,
  };
}

function emptyQuestionReport(
  item: EvaluationQuestion,
): QuestionReport {
  return {
    id: item.id,
    question: item.question,
    category: item.category,
    difficulty: item.difficulty,
    relevantFiles:
      item.relevantFiles,

    dense:
      emptyStrategyResult(),

    lexical:
      emptyStrategyResult(),

    hybrid:
      emptyStrategyResult(),

    reranker: {
      rrf_1_1:
        emptyStrategyResult(),

      rrf_1_1_5:
        emptyStrategyResult(),

      rrf_1_2:
        emptyStrategyResult(),

      rrf_1_3:
        emptyStrategyResult(),
    },

    coverage: {
      denseFound: false,
      lexicalFound: false,
      hybridFound: false,

      rerankerFound: {
        rrf_1_1: false,
        rrf_1_1_5: false,
        rrf_1_2: false,
        rrf_1_3: false,
      },
    },

    diagnosis: [
      "BENCHMARK_ERROR",
    ],
  };
}

async function main() {
  console.log(
    "==============================================",
  );

  console.log(
    "BENCHMARK CONSOLIDADO DE RETRIEVAL",
  );

  console.log(
    "==============================================",
  );

  const datasetRaw =
    await readFile(
      DATASET_PATH,
      "utf-8",
    );

  const dataset =
    JSON.parse(
      datasetRaw,
    ) as EvaluationQuestion[];

  console.log(
    `Perguntas: ${dataset.length}`,
  );

  await mkdir(
    REPORT_DIR,
    {
      recursive: true,
    },
  );

  const questionReports: QuestionReport[] =
    [];

  const rerankerStrategies = {
    "1:1":
      [] as StrategyResult[],

    "1:1.5":
      [] as StrategyResult[],

    "1:2":
      [] as StrategyResult[],

    "1:3":
      [] as StrategyResult[],
  };

  let denseRecall = 0;
  let lexicalRecall = 0;
  let hybridRecall = 0;

  let denseOnly = 0;
  let lexicalOnly = 0;
  let bothDenseAndLexical = 0;
  let neitherDenseNorLexical = 0;

  const start =
    performance.now();

  for (
    let i = 0;
    i < dataset.length;
    i++
  ) {
    const item =
      dataset[i];

    console.log(
      `[${i + 1}/${dataset.length}] ${item.id} — ${item.question}`,
    );

    try {
      /*
       * ============================================================
       * 1. DENSE
       * ============================================================
       */

      const embedding =
        await embeddingService.generate(
          item.question,
        );

      const rawDenseResults =
        await vectorStore.search(
          embedding,
          RETRIEVAL_K,
          0,
        );

      const denseResults =
        convertDenseResults(
          rawDenseResults,
        );

      /*
       * ============================================================
       * 2. LEXICAL
       * ============================================================
       */

      const rawLexicalResults =
        await lexicalSearchService.search(
          item.question,
          RETRIEVAL_K,
        );

      const lexicalResults =
        convertLexicalResults(
          rawLexicalResults,
        );

      /*
       * ============================================================
       * 3. RRF
       * ============================================================
       */

      const rrf11 =
        buildRrfResults(
          denseResults,
          lexicalResults,
          1,
          1,
        );

      const rrf115 =
        buildRrfResults(
          denseResults,
          lexicalResults,
          1,
          1.5,
        );

      const rrf12 =
        buildRrfResults(
          denseResults,
          lexicalResults,
          1,
          2,
        );

      const rrf13 =
        buildRrfResults(
          denseResults,
          lexicalResults,
          1,
          3,
        );

      /*
       * ============================================================
       * 4. RANKS
       * ============================================================
       */

      const denseRank =
        findRank(
          denseResults,
          item.relevantFiles,
        );

      const lexicalRank =
        findRank(
          lexicalResults,
          item.relevantFiles,
        );

      const hybridRank =
        findHybridRank(
          rrf11,
          item.relevantFiles,
        );

      const denseTarget =
        findResult(
          denseResults,
          item.relevantFiles,
        );

      const lexicalTarget =
        findResult(
          lexicalResults,
          item.relevantFiles,
        );

      const hybridTarget =
        findHybridResult(
          rrf11,
          item.relevantFiles,
        );

      /*
       * ============================================================
       * 5. UNION DOS CANDIDATOS
       *
       * O reranker só precisa calcular a relevância de cada
       * combinação pergunta + chunk uma única vez.
       *
       * As quatro estratégias RRF usam os mesmos candidatos-base.
       * ============================================================
       */

      const mergedCandidates =
  Array.from(
    new Map(
      [
        ...rrf11,
        ...rrf115,
        ...rrf12,
        ...rrf13,
      ].map(
        (result) => [
          result.chunk.id,
          result,
        ],
      ),
    ).values(),
  );

const rerankerCandidates =
  mergedCandidates.map(
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

        // O benchmark não precisa do embedding
        // para o reranking, mas SearchResult exige
        // esse campo no tipo.
        embedding: [],
      },

      similarity_score:
        result.similarity_score,
    }),
  );

const rerankedUnion =
  await rerankerService.rerank(
    item.question,
    rerankerCandidates,
  );

      /*
       * ============================================================
       * 7. APLICA O RESULTADO DO RERANKER
       *
       * O score do reranker é independente da estratégia RRF.
       * Portanto podemos reutilizar os scores para as quatro
       * estratégias sem executar o modelo quatro vezes.
       * ============================================================
       */

      const reranked11 =
        filterRerankerResultsForStrategy(
          rerankedUnion,
          rrf11,
        );

      const reranked115 =
        filterRerankerResultsForStrategy(
          rerankedUnion,
          rrf115,
        );

      const reranked12 =
        filterRerankerResultsForStrategy(
          rerankedUnion,
          rrf12,
        );

      const reranked13 =
        filterRerankerResultsForStrategy(
          rerankedUnion,
          rrf13,
        );

      /*
       * ============================================================
       * 8. RANK DO DOCUMENTO RELEVANTE APÓS RERANKER
       * ============================================================
       */

      const reranker11 =
        strategyFromReranker(
          reranked11,
          item.relevantFiles,
        );

      const reranker115 =
        strategyFromReranker(
          reranked115,
          item.relevantFiles,
        );

      const reranker12 =
        strategyFromReranker(
          reranked12,
          item.relevantFiles,
        );

      const reranker13 =
        strategyFromReranker(
          reranked13,
          item.relevantFiles,
        );

      /*
       * ============================================================
       * 9. RELATÓRIO DA PERGUNTA
       * ============================================================
       */

      const report: QuestionReport = {
        id: item.id,
        question:
          item.question,
        category:
          item.category,
        difficulty:
          item.difficulty,
        relevantFiles:
          item.relevantFiles,

        dense:
          createStrategyResult(
            denseTarget,
            denseRank,
          ),

        lexical:
          createStrategyResult(
            lexicalTarget,
            lexicalRank,
          ),

        hybrid:
          createHybridStrategyResult(
            hybridTarget,
            hybridRank,
          ),

        reranker: {
          rrf_1_1:
            reranker11,

          rrf_1_1_5:
            reranker115,

          rrf_1_2:
            reranker12,

          rrf_1_3:
            reranker13,
        },

        coverage: {
          denseFound:
            denseRank !== null,

          lexicalFound:
            lexicalRank !== null,

          hybridFound:
            hybridRank !== null,

          rerankerFound: {
            rrf_1_1:
              reranker11.rank !== null,

            rrf_1_1_5:
              reranker115.rank !== null,

            rrf_1_2:
              reranker12.rank !== null,

            rrf_1_3:
              reranker13.rank !== null,
          },
        },

        diagnosis: [],
      };

      report.diagnosis =
        diagnose(
          report.dense,
          report.lexical,
          report.hybrid,
          report.reranker,
        );

      questionReports.push(
        report,
      );

      /*
       * ============================================================
       * 10. MÉTRICAS
       * ============================================================
       */

      if (
        denseRank !== null &&
        denseRank <= RETRIEVAL_K
      ) {
        denseRecall++;
      }

      if (
        lexicalRank !== null &&
        lexicalRank <= RETRIEVAL_K
      ) {
        lexicalRecall++;
      }

      if (
        hybridRank !== null &&
        hybridRank <= RETRIEVAL_K
      ) {
        hybridRecall++;
      }

      rerankerStrategies[
        "1:1"
      ].push(
        reranker11,
      );

      rerankerStrategies[
        "1:1.5"
      ].push(
        reranker115,
      );

      rerankerStrategies[
        "1:2"
      ].push(
        reranker12,
      );

      rerankerStrategies[
        "1:3"
      ].push(
        reranker13,
      );

      /*
       * ============================================================
       * 11. COBERTURA DENSE VS LEXICAL
       * ============================================================
       */

      if (
        denseRank !== null &&
        lexicalRank === null
      ) {
        denseOnly++;
      } else if (
        lexicalRank !== null &&
        denseRank === null
      ) {
        lexicalOnly++;
      } else if (
        denseRank !== null &&
        lexicalRank !== null
      ) {
        bothDenseAndLexical++;
      } else {
        neitherDenseNorLexical++;
      }
    } catch (error) {
      console.error(
        `Erro em ${item.id}:`,
        error,
      );

      questionReports.push(
        emptyQuestionReport(item),
      );
    }
  }

  const elapsed =
    performance.now() -
    start;

  /*
   * ==============================================================
   * 12. MÉTRICAS DO RERANKER
   * ==============================================================
   */

  const rerankerRecall = {
    "1:1":
      countRecall(
        rerankerStrategies[
          "1:1"
        ],
      ),

    "1:1.5":
      countRecall(
        rerankerStrategies[
          "1:1.5"
        ],
      ),

    "1:2":
      countRecall(
        rerankerStrategies[
          "1:2"
        ],
      ),

    "1:3":
      countRecall(
        rerankerStrategies[
          "1:3"
        ],
      ),
  };

  const rerankerMRR = {
    "1:1":
      rerankerStrategies[
        "1:1"
      ].reduce(
        (sum, result) =>
          sum +
          reciprocalRank(
            result.rank,
          ),
        0,
      ) / dataset.length,

    "1:1.5":
      rerankerStrategies[
        "1:1.5"
      ].reduce(
        (sum, result) =>
          sum +
          reciprocalRank(
            result.rank,
          ),
        0,
      ) / dataset.length,

    "1:2":
      rerankerStrategies[
        "1:2"
      ].reduce(
        (sum, result) =>
          sum +
          reciprocalRank(
            result.rank,
          ),
        0,
      ) / dataset.length,

    "1:3":
      rerankerStrategies[
        "1:3"
      ].reduce(
        (sum, result) =>
          sum +
          reciprocalRank(
            result.rank,
          ),
        0,
      ) / dataset.length,
  };

  /*
   * ==============================================================
   * 13. RELATÓRIO FINAL
   * ==============================================================
   */

  const report: BenchmarkReport = {
    generatedAt:
      new Date().toISOString(),

    datasetSize:
      dataset.length,

    configuration: {
      retrievalK:
        RETRIEVAL_K,

      rerankerFinalK:
        FINAL_K,

      rrfK:
        RRF_K,

      rrfWeights: {
        "1:1": [1, 1],
        "1:1.5": [1, 1.5],
        "1:2": [1, 2],
        "1:3": [1, 3],
      },
    },

    summary: {
      denseRecallAt60:
        denseRecall /
        dataset.length,

      lexicalRecallAt60:
        lexicalRecall /
        dataset.length,

      hybridRecallAt60:
        hybridRecall /
        dataset.length,

      rerankerRecallAt5: {
        "1:1":
          rerankerRecall[
            "1:1"
          ] / dataset.length,

        "1:1.5":
          rerankerRecall[
            "1:1.5"
          ] / dataset.length,

        "1:2":
          rerankerRecall[
            "1:2"
          ] / dataset.length,

        "1:3":
          rerankerRecall[
            "1:3"
          ] / dataset.length,
      },

      rerankerMRRAt5:
        rerankerMRR,

      rerankerAverageRank: {
        "1:1":
          averageRank(
            rerankerStrategies[
              "1:1"
            ],
          ),

        "1:1.5":
          averageRank(
            rerankerStrategies[
              "1:1.5"
            ],
          ),

        "1:2":
          averageRank(
            rerankerStrategies[
              "1:2"
            ],
          ),

        "1:3":
          averageRank(
            rerankerStrategies[
              "1:3"
            ],
          ),
      },
    },

    diagnostics: {
      denseOnly,
      lexicalOnly,
      bothDenseAndLexical,
      neitherDenseNorLexical,

      hybridMisses:
        questionReports.filter(
          (question) =>
            !question.coverage
              .hybridFound,
        ).length,

      rerankerMisses: {
        "1:1":
          questionReports.filter(
            (question) =>
              !question.coverage
                .rerankerFound
                .rrf_1_1,
          ).length,

        "1:1.5":
          questionReports.filter(
            (question) =>
              !question.coverage
                .rerankerFound
                .rrf_1_1_5,
          ).length,

        "1:2":
          questionReports.filter(
            (question) =>
              !question.coverage
                .rerankerFound
                .rrf_1_2,
          ).length,

        "1:3":
          questionReports.filter(
            (question) =>
              !question.coverage
                .rerankerFound
                .rrf_1_3,
          ).length,
      },
    },

    questions:
      questionReports,
  };

  await writeFile(
    REPORT_PATH,
    JSON.stringify(
      report,
      null,
      2,
    ),
    "utf-8",
  );

  /*
   * ==============================================================
   * 14. SAÍDA RESUMIDA NO TERMINAL
   * ==============================================================
   */

  console.log("");

  console.log(
    "==============================================",
  );

  console.log(
    "RESULTADO CONSOLIDADO",
  );

  console.log(
    "==============================================",
  );

  console.log(
    `Dense @60:   ${denseRecall}/${dataset.length} (${(
      (denseRecall /
        dataset.length) *
      100
    ).toFixed(1)}%)`,
  );

  console.log(
    `Lexical @60: ${lexicalRecall}/${dataset.length} (${(
      (lexicalRecall /
        dataset.length) *
      100
    ).toFixed(1)}%)`,
  );

  console.log(
    `Hybrid @60:  ${hybridRecall}/${dataset.length} (${(
      (hybridRecall /
        dataset.length) *
      100
    ).toFixed(1)}%)`,
  );

  console.log("");

  console.log(
    `RRF 1:1   + reranker: ${rerankerRecall["1:1"]}/${dataset.length} (${(
      (rerankerRecall["1:1"] /
        dataset.length) *
      100
    ).toFixed(1)}%)`,
  );

  console.log(
    `RRF 1:1.5 + reranker: ${rerankerRecall["1:1.5"]}/${dataset.length} (${(
      (rerankerRecall["1:1.5"] /
        dataset.length) *
      100
    ).toFixed(1)}%)`,
  );

  console.log(
    `RRF 1:2   + reranker: ${rerankerRecall["1:2"]}/${dataset.length} (${(
      (rerankerRecall["1:2"] /
        dataset.length) *
      100
    ).toFixed(1)}%)`,
  );

  console.log(
    `RRF 1:3   + reranker: ${rerankerRecall["1:3"]}/${dataset.length} (${(
      (rerankerRecall["1:3"] /
        dataset.length) *
      100
    ).toFixed(1)}%)`,
  );

  console.log("");

  console.log(
    `Dense only: ${denseOnly}`,
  );

  console.log(
    `Lexical only: ${lexicalOnly}`,
  );

  console.log(
    `Ambos: ${bothDenseAndLexical}`,
  );

  console.log(
    `Nenhum: ${neitherDenseNorLexical}`,
  );

  console.log("");

  console.log(
    `Tempo total: ${(elapsed / 1000).toFixed(2)}s`,
  );

  console.log(
    `Relatório salvo em: ${REPORT_PATH}`,
  );

  console.log(
    "==============================================",
  );
}

main().catch(
  (error) => {
    console.error(
      "Benchmark falhou:",
      error,
    );

    process.exit(1);
  },
);