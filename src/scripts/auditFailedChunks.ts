import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { db } from "../db/index.js";
import { documents } from "../db/schema/documents.js";
import { documentChunks } from "../db/schema/documentChunks.js";
import { eq, asc } from "drizzle-orm";

interface EvaluationQuestion {
  id: string;
  question: string;
  relevantFiles: string[];
  category: string;
  difficulty: string;
}

const DATASET_PATH = resolve(
  process.cwd(),
  "src/evaluation/datasets/rag-evaluation.json",
);

const REPORT_PATH = resolve(
  process.cwd(),
  "src/evaluation/reports/retrieval-consolidated.json",
);

interface BenchmarkQuestionReport {
  id: string;
  coverage: {
    denseFound: boolean;
    lexicalFound: boolean;
    hybridFound: boolean;
  };
  diagnosis: string[];
}

interface BenchmarkReport {
  questions: BenchmarkQuestionReport[];
}


function normalizeFilename(
  filename: string,
): string {
  return filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(
      /[^a-z0-9._-]/g,
      "",
    );
}

function isSameFilename(
  actual: string,
  expected: string,
): boolean {
  return (
    normalizeFilename(actual) ===
    normalizeFilename(expected)
  );
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim();
}

function previewStart(
  text: string,
  length = 180,
): string {
  const cleaned = cleanText(text);

  if (cleaned.length <= length) {
    return cleaned;
  }

  return `${cleaned.slice(
    0,
    length,
  )}...`;
}

function previewEnd(
  text: string,
  length = 180,
): string {
  const cleaned = cleanText(text);

  if (cleaned.length <= length) {
    return cleaned;
  }

  return `...${cleaned.slice(
    -length,
  )}`;
}

function hasTimestampAtEnd(
  text: string,
): boolean {
  return /\[\d{2}:\d{2}:\d{2}\]\s*$/.test(
    text.trim(),
  );
}

function looksLikeBrokenSentenceEnd(
  text: string,
): boolean {
  const cleaned = cleanText(text);

  if (!cleaned) {
    return false;
  }

  const lastChar =
    cleaned[cleaned.length - 1];

  return ![
    ".",
    "!",
    "?",
    ":",
    ";",
    ")",
    "]",
    '"',
    "'",
  ].includes(lastChar);
}

function hasVeryShortEnding(
  text: string,
): boolean {
  const cleaned = cleanText(text);

  const words =
    cleaned.split(/\s+/);

  if (words.length === 0) {
    return false;
  }

  const ending =
    words.slice(-8).join(" ");

  return ending.length < 25;
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

async function findDocument(
  filename: string,
) {
  const allDocuments =
    await db
      .select({
        id: documents.id,
        filename:
          documents.filename,
      })
      .from(documents);

  return allDocuments.find(
    (document) =>
      isSameFilename(
        document.filename,
        filename,
      ),
  );
}

async function auditQuestion(
  question: EvaluationQuestion,
): Promise<void> {
  console.log();
  console.log(
    "============================================================",
  );
  console.log(
    `${question.id} — ${question.question}`,
  );
  console.log(
    "============================================================",
  );

  console.log(
    `Categoria: ${question.category}`,
  );

  console.log(
    `Dificuldade: ${question.difficulty}`,
  );

  console.log(
    `Arquivo esperado:`,
  );

  for (const filename of question.relevantFiles) {
    console.log(`  - ${filename}`);
  }

  for (const filename of question.relevantFiles) {
    const document =
      await findDocument(
        filename,
      );

    if (!document) {
      console.log();
      console.log(
        `DOCUMENTO NÃO ENCONTRADO: ${filename}`,
      );
      continue;
    }

    const chunks =
      await db
        .select({
          chunkIndex:
            documentChunks.chunkIndex,

          text:
            documentChunks.text,

          charStart:
            documentChunks.charStart,

          charEnd:
            documentChunks.charEnd,
        })
        .from(documentChunks)
        .where(
          eq(
            documentChunks.documentId,
            document.id,
          ),
        )
        .orderBy(
          asc(
            documentChunks.chunkIndex,
          ),
        );

    console.log();
    console.log(
      `DOCUMENTO: ${document.filename}`,
    );

    console.log(
      `TOTAL DE CHUNKS: ${chunks.length}`,
    );

    for (const chunk of chunks) {
      const text = chunk.text;

      const brokenSentence =
        looksLikeBrokenSentenceEnd(
          text,
        );

      const shortEnding =
        hasVeryShortEnding(text);

      const timestampAtEnd =
        hasTimestampAtEnd(text);

      console.log();
      console.log(
        `--- CHUNK ${chunk.chunkIndex} ---`,
      );

      console.log(
        `chars: ${text.length}`,
      );

      console.log(
        `range: ${chunk.charStart} → ${chunk.charEnd}`,
      );

      console.log(
        `brokenSentenceEnd: ${
          brokenSentence
            ? "SIM"
            : "não"
        }`,
      );

      console.log(
        `shortEnding: ${
          shortEnding
            ? "SIM"
            : "não"
        }`,
      );

      console.log(
        `timestampAtEnd: ${
          timestampAtEnd
            ? "SIM"
            : "não"
        }`,
      );

      console.log(
        `INÍCIO: ${previewStart(
          text,
        )}`,
      );

      console.log(
        `FIM: ${previewEnd(
          text,
        )}`,
      );
    }
  }
}

async function main(): Promise<void> {
  const dataset =
    await loadDataset();

  const reportRaw = await readFile(
    REPORT_PATH,
    "utf8",
  );

  const benchmarkReport =
    JSON.parse(reportRaw) as BenchmarkReport;

  const failedIds = new Set(
    benchmarkReport.questions
      .filter((question) => !question.coverage.hybridFound)
      .map((question) => question.id),
  );

  const questions = dataset.filter(
    (question) => failedIds.has(question.id),
  );

  console.log(
    `Perguntas para auditoria: ${questions.length}`,
  );

  console.log(
    `Fonte das falhas: ${REPORT_PATH}`,
  );

  for (const question of questions) {
    await auditQuestion(
      question,
    );
  }

  console.log();
  console.log(
    "============================================================",
  );
  console.log(
    "AUDITORIA FINALIZADA",
  );
  console.log(
    "============================================================",
  );
}

main().catch((error) => {
  console.error(
    "Erro durante auditoria:",
    error,
  );

  process.exit(1);
});
