import { embeddingService } from "./src/lib/embeddings.js";
import { QdrantClient } from "@qdrant/js-client-rest";

async function main() {
  const question =
    "Como localizar um produto pelo nome na tela de contagem de estoque?";

  console.log("Gerando embedding...");

  const embedding = await embeddingService.generate(question);

  console.log("Dimensões:", embedding.length);
  console.log("Primeiros valores:", embedding.slice(0, 5));

  const client = new QdrantClient({
    url: "http://localhost:6333",
  });

  console.log("Consultando Qdrant...");

  const result = await client.query("vrtech_knowledge", {
    query: embedding,
    limit: 5,
    score_threshold: 0,
    with_payload: true,
    with_vector: false,
  });

  console.log("Resultados:", result.points.length);

  for (const [index, point] of result.points.entries()) {
    console.log("");
    console.log(`#${index + 1}`);
    console.log("score:", point.score);
    console.log("arquivo:", point.payload?.source_file);
    console.log("chunk:", point.payload?.chunk_index);
    console.log(
      "texto:",
      String(point.payload?.text ?? "").slice(0, 300),
    );
  }
}

main().catch((error) => {
  console.error("");
  console.error("ERRO:");
  console.error(error);
  process.exit(1);
});
