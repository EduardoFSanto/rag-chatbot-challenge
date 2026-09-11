import { pipeline, env } from "@xenova/transformers";
import { QdrantClient } from "@qdrant/js-client-rest";

env.cacheDir = "./.cache";

const SOURCE_COLLECTION = "vrtech_knowledge";
const BENCHMARK_COLLECTION = "vrtech_knowledge_benchmark_e5";

const MODEL = "intfloat/multilingual-e5-small";
const VECTOR_SIZE = 384;

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

async function main() {
  console.log("\n========================================");
  console.log("BENCHMARK DE EMBEDDINGS");
  console.log("========================================");
  console.log(`Modelo: ${MODEL}`);

  const extractor = await pipeline(
    "feature-extraction",
    MODEL,
  );

  console.log("\nModelo carregado.");

  /*
   * ---------------------------------------------------------
   * 1. Criar coleção temporária
   * ---------------------------------------------------------
   */

  const collections = await client.getCollections();

  const exists = collections.collections.some(
    (collection) => collection.name === BENCHMARK_COLLECTION,
  );

  if (exists) {
    console.log("\nRemovendo coleção de benchmark anterior...");

    await client.deleteCollection(BENCHMARK_COLLECTION);
  }

  await client.createCollection(BENCHMARK_COLLECTION, {
    vectors: {
      size: VECTOR_SIZE,
      distance: "Cosine",
    },
  });

  /*
   * ---------------------------------------------------------
   * 2. Ler documentos existentes do Qdrant
   * ---------------------------------------------------------
   */

  console.log("\nLendo chunks da coleção atual...");

  let offset: string | number | Record<string, unknown> | null = null;
  let total = 0;

  while (true) {
    const response = await client.scroll(SOURCE_COLLECTION, {
      limit: 100,
      offset,
      with_payload: true,
      with_vector: false,
    });

    const points = response.points;

    if (points.length === 0) {
      break;
    }

    const benchmarkPoints = [];

    for (const point of points) {
      const text = String(point.payload?.text || "").trim();

      if (!text) {
        continue;
      }

      const input = `passage: ${text}`;

      const output = await extractor(input, {
        pooling: "mean",
        normalize: true,
      });

      const embedding = Array.from(output.data) as number[];

      benchmarkPoints.push({
        id: String(point.id),
        vector: embedding,
        payload: point.payload,
      });
    }

    if (benchmarkPoints.length > 0) {
      await client.upsert(BENCHMARK_COLLECTION, {
        wait: true,
        points: benchmarkPoints,
      });

      total += benchmarkPoints.length;

      console.log(`Embeddings gerados: ${total}`);
    }

    offset = response.next_page_offset ?? null;

    if (offset === null) {
      break;
    }
  }

  console.log(`\nTotal indexado no benchmark: ${total}`);

  /*
   * ---------------------------------------------------------
   * 3. Testar perguntas
   * ---------------------------------------------------------
   */

  for (const question of questions) {
    console.log("\n========================================");
    console.log(`PERGUNTA: ${question}`);
    console.log("========================================");

    const output = await extractor(
      `query: ${question}`,
      {
        pooling: "mean",
        normalize: true,
      },
    );

    const queryEmbedding = Array.from(output.data) as number[];

    const results = await client.query(
      BENCHMARK_COLLECTION,
      {
        query: queryEmbedding,
        limit: 5,
        score_threshold: 0,
        with_payload: true,
        with_vector: false,
      },
    );

    results.points.forEach((result, index) => {
      const payload = result.payload || {};

      console.log(
        `\n#${index + 1} | score=${Number(result.score).toFixed(4)}`,
      );

      console.log(
        `arquivo: ${payload.source_file || "sem arquivo"}`,
      );

      console.log(
        `chunk: ${payload.chunk_index ?? "?"}`,
      );

      const text = String(payload.text || "")
        .replace(/\s+/g, " ")
        .trim();

      console.log(text.substring(0, 500));
    });
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