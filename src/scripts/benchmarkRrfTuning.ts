import "dotenv/config";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { embeddingService } from "../lib/embeddings.js";
import { vectorStore } from "../lib/storage/vectorStore.js";
import { lexicalSearchService } from "../lib/search/lexicalSearch.js";

interface EvaluationQuestion {
  id: string;
  question: string;
  relevantFiles: string[];
  category: string;
  difficulty: string;
}

interface Candidate {
  chunk: {
    id: string;
    source_file: string;
  };
  denseScore: number | null;
  lexicalScore: number | null;
  denseRank: number | null;
  lexicalRank: number | null;
}

interface RankedResult {
  source_file: string;
  score: number;
}

const DATASET_PATH = resolve(
  process.cwd(),
  "src/evaluation/datasets/rag-evaluation.json",
);

const K_VALUES = [10, 20, 30, 40, 50, 60];

const WEIGHTS = [
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

const RRF_K = 60;

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
  const normalized = normalizeFilename(filename);

  return expectedFiles.some(
    (expectedFile) =>
      normalizeFilename(expectedFile) === normalized,
  );
}

function findRank(
  results: RankedResult[],
  expectedFiles: string[],
): number | null {
  const index = results.findIndex((result) =>
    isExpectedFile(
      result.source_file,
      expectedFiles,
    ),
  );

  return index === -1 ? null : index + 1;
}

function calculateRrfScore(
  candidate: Candidate,
  denseWeight: number,
  lexicalWeight: number,
): number {
  let score = 0;

  if (candidate.denseRank !== null) {
    score +=
      denseWeight /
      (RRF_K + candidate.denseRank);
  }

  if (candidate.lexicalRank !== null) {
    score +=
      lexicalWeight /
      (RRF_K + candidate.lexicalRank);
  }

  return score;
}

function fuse(
  denseResults: Array<{
    chunk: {
      id: string;
      source_file: string;
    };
    similarity_score: number;
  }>,
  lexicalResults: Array<{
    chunk: {
      id: string;
      source_file: string;
    };
    lexical_score: number;
  }>,
  denseWeight: number,
  lexicalWeight: number,
  limit: number,
): RankedResult[] {
  const candidates = new Map<string, Candidate>();

  denseResults.forEach((result, index) => {
    candidates.set(result.chunk.id, {
      chunk: {
        id: result.chunk.id,
        source_file: result.chunk.source_file,
      },
      denseScore: result.similarity_score,
      lexicalScore: null,
      denseRank: index + 1,
      lexicalRank: null,
    });
  });

  lexicalResults.forEach((result, index) => {
    const existing = candidates.get(result.chunk.id);

    if (existing) {
      existing.lexicalScore =
        result.lexical_score;
      existing.lexicalRank = index + 1;
      return;
    }

    candidates.set(result.chunk.id, {
      chunk: {
        id: result.chunk.id,
        source_file: result.chunk.source_file,
      },
      denseScore: null,
      lexicalScore: result.lexical_score,
      denseRank: null,
      lexicalRank: index + 1,
    });
  });

  return Array.from(candidates.values())
    .map((candidate) => ({
      source_file: candidate.chunk.source_file,
      score: calculateRrfScore(
        candidate,
        denseWeight,
        lexicalWeight,
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function main() {
  const dataset = JSON.parse(
    await readFile(DATASET_PATH, "utf8"),
  ) as EvaluationQuestion[];

  console.log("");
  console.log("============================================================");
  console.log("BENCHMARK DE TUNING DO RRF");
  console.log("============================================================");
  console.log(`Perguntas: ${dataset.length}`);
  console.log(`RRF K constante: ${RRF_K}`);
  console.log("");

  const questionResults = new Map<
    string,
    {
      dense: RankedResult[];
      lexical: RankedResult[];
      hybrid: Map<string, RankedResult[]>;
    }
  >();

  for (let index = 0; index < dataset.length; index++) {
    const item = dataset[index];

    process.stdout.write(
      `[${String(index + 1).padStart(3, "0")}/${dataset.length}] ${item.id}\r`,
    );

    const embedding =
      await embeddingService.generate(
        item.question,
      );

    const dense = await vectorStore.search(
      embedding,
      60,
      0,
    );

    const lexical =
      await lexicalSearchService.search(
        item.question,
        60,
      );

    const denseRanked: RankedResult[] =
      dense.map((result) => ({
        source_file:
          result.chunk.source_file,
        score: result.similarity_score,
      }));

    const lexicalRanked: RankedResult[] =
      lexical.map((result) => ({
        source_file:
          result.chunk.source_file,
        score: result.lexical_score,
      }));

    const hybridByWeight = new Map<
      string,
      RankedResult[]
    >();

    for (const weight of WEIGHTS) {
      const hybrid = fuse(
        dense.map((result) => ({
          chunk: {
            id: result.chunk.id,
            source_file:
              result.chunk.source_file,
          },
          similarity_score:
            result.similarity_score,
        })),
        lexical.map((result) => ({
          chunk: {
            id: result.chunk.id,
            source_file:
              result.chunk.source_file,
          },
          lexical_score:
            result.lexical_score,
        })),
        weight.denseWeight,
        weight.lexicalWeight,
        60,
      );

      hybridByWeight.set(weight.name, hybrid);
    }

    questionResults.set(item.id, {
      dense: denseRanked,
      lexical: lexicalRanked,
      hybrid: hybridByWeight,
    });
  }

  console.log("");
  console.log("");
  console.log("============================================================");
  console.log("RECALL POR K");
  console.log("============================================================");

  for (const k of K_VALUES) {
    console.log("");
    console.log(`K = ${k}`);
    console.log("------------------------------------------------------------");

    const denseCount = dataset.filter((item) => {
      const result =
        questionResults.get(item.id)!;

      const rank = findRank(
        result.dense.slice(0, k),
        item.relevantFiles,
      );

      return rank !== null;
    }).length;

    const lexicalCount = dataset.filter((item) => {
      const result =
        questionResults.get(item.id)!;

      const rank = findRank(
        result.lexical.slice(0, k),
        item.relevantFiles,
      );

      return rank !== null;
    }).length;

    console.log(
      `Dense:   ${denseCount}/${dataset.length} (${(
        (denseCount / dataset.length) *
        100
      ).toFixed(1)}%)`,
    );

    console.log(
      `Lexical: ${lexicalCount}/${dataset.length} (${(
        (lexicalCount / dataset.length) *
        100
      ).toFixed(1)}%)`,
    );

    for (const weight of WEIGHTS) {
      const count = dataset.filter((item) => {
        const result =
          questionResults.get(item.id)!;

        const hybrid =
          result.hybrid.get(weight.name)!;

        const rank = findRank(
          hybrid.slice(0, k),
          item.relevantFiles,
        );

        return rank !== null;
      }).length;

      console.log(
        `${weight.name.padEnd(13)} ${count}/${dataset.length} (${(
          (count / dataset.length) *
          100
        ).toFixed(1)}%)`,
      );
    }
  }

  console.log("");
  console.log("============================================================");
  console.log("CASOS EM QUE O LEXICAL ENCONTRA E O RRF 1:1 PERDE");
  console.log("============================================================");

  let printed = 0;

  for (const item of dataset) {
    const result =
      questionResults.get(item.id)!;

    const lexicalRank = findRank(
      result.lexical,
      item.relevantFiles,
    );

    const hybrid =
      result.hybrid.get("RRF 1:1")!;

    const hybridRank = findRank(
      hybrid,
      item.relevantFiles,
    );

    if (
      lexicalRank !== null &&
      hybridRank === null
    ) {
      console.log("");
      console.log(`${item.id}`);
      console.log(`Pergunta: ${item.question}`);
      console.log(`Lexical: #${lexicalRank}`);
      console.log("RRF 1:1: NÃO ENCONTRADO");

      printed++;

      if (printed >= 20) {
        break;
      }
    }
  }

  console.log("");
  console.log("============================================================");
  console.log("CASOS EM QUE O DENSE ENCONTRA E O LEXICAL NÃO");
  console.log("============================================================");

  printed = 0;

  for (const item of dataset) {
    const result =
      questionResults.get(item.id)!;

    const denseRank = findRank(
      result.dense,
      item.relevantFiles,
    );

    const lexicalRank = findRank(
      result.lexical,
      item.relevantFiles,
    );

    if (
      denseRank !== null &&
      lexicalRank === null
    ) {
      console.log("");
      console.log(`${item.id}`);
      console.log(`Pergunta: ${item.question}`);
      console.log(`Dense: #${denseRank}`);
      console.log("Lexical: NÃO ENCONTRADO");

      printed++;

      if (printed >= 20) {
        break;
      }
    }
  }

  console.log("");
  console.log("============================================================");
  console.log("FIM");
  console.log("============================================================");
}

main().catch((error) => {
  console.error("");
  console.error("ERRO NO BENCHMARK:");
  console.error(error);
  process.exit(1);
});
