import { pipeline, env } from "@xenova/transformers";
import { QdrantClient } from "@qdrant/js-client-rest";

env.cacheDir = "./.cache";

const COLLECTION_NAME = "vrtech_knowledge";
const MODEL = "Xenova/all-MiniLM-L6-v2";

const TARGET_DOCUMENT =
  "Contagem de estoque por seleções como classe, sub, marca, etc....transcript.txt";

const questions = [
  "como ajustar o estoque no etrade?",
  "contagem de estoque",
  "como fazer contagem de estoque?",
  "contagem de estoque no etrade",
  "ajustar estoque através da contagem de estoque",
  "gerar movimento de entrada e saída na contagem de estoque",
];

const client = new QdrantClient({
  url: process.env.QDRANT_URL || "http://localhost:6333",
});

async function main() {
  console.log("\n========================================");
  console.log("BENCHMARK - DOCUMENTO ESPECÍFICO");
  console.log("========================================");
  console.log(`Modelo: ${MODEL}`);
  console.log(`Documento: ${TARGET_DOCUMENT}`);

  console.log("\nCarregando modelo...");

  const extractor = await pipeline(
    "feature-extraction",
    MODEL,
  );

  console.log("Modelo carregado.");

  console.log("\nBuscando documento no Qdrant...");

  const targetPoints: any[] = [];

  let offset: any = null;

  while (true) {
    const response = await client.scroll(COLLECTION_NAME, {
      limit: 100,
      offset,
      with_payload: true,
      with_vector: true,
    });

    if (response.points.length === 0) {
      break;
    }

    for (const point of response.points) {
      const sourceFile = String(
        point.payload?.source_file || "",
      );

      if (sourceFile === TARGET_DOCUMENT) {
        targetPoints.push(point);
      }
    }

    offset = response.next_page_offset ?? null;

    if (offset === null) {
      break;
    }
  }

  if (targetPoints.length === 0) {
    console.log("\nDocumento não encontrado.");

    console.log(
      "\nVerifique o nome do arquivo exatamente como aparece no Qdrant.",
    );

    process.exit(1);
  }

  console.log(
    `\nChunks encontrados no documento: ${targetPoints.length}`,
  );

  targetPoints.sort((a, b) => {
    const chunkA = Number(
      a.payload?.chunk_index ?? 0,
    );

    const chunkB = Number(
      b.payload?.chunk_index ?? 0,
    );

    return chunkA - chunkB;
  });

  console.log("\nChunks disponíveis:");

  for (const point of targetPoints) {
    const payload = point.payload || {};

    console.log(
      `  chunk ${payload.chunk_index ?? "?"}`,
    );
  }

  for (const question of questions) {
    console.log("\n\n========================================");
    console.log(`PERGUNTA: ${question}`);
    console.log("========================================");

    const output = await extractor(question, {
      pooling: "mean",
      normalize: true,
    });

    const queryEmbedding = Array.from(
      output.data,
    ) as number[];

    const scored = targetPoints.map((point) => {
      const vector = Array.from(
        point.vector || [],
      ) as number[];

      return {
        point,
        score: cosineSimilarity(
          queryEmbedding,
          vector,
        ),
      };
    });

    scored.sort((a, b) => b.score - a.score);

    scored.forEach((item, index) => {
      const payload = item.point.payload || {};

      console.log(
        `\n#${index + 1} | score=${item.score.toFixed(4)}`,
      );

      console.log(
        `chunk: ${payload.chunk_index ?? "?"}`,
      );

      console.log(
        `posição: ${payload.char_start ?? "?"} - ${
          payload.char_end ?? "?"
        }`,
      );

      const text = String(
        payload.text || "",
      )
        .replace(/\s+/g, " ")
        .trim();

      console.log(text.substring(0, 700));
    });
  }

  console.log("\n\n========================================");
  console.log("BENCHMARK FINALIZADO");
  console.log("========================================");
}

function cosineSimilarity(
  a: number[],
  b: number[],
): number {
  if (a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return (
    dot /
    (Math.sqrt(normA) * Math.sqrt(normB))
  );
}

main().catch((error) => {
  console.error("\nBenchmark failed:");
  console.error(error);
  process.exit(1);
});

