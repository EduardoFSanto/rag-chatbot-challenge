import { embeddingService } from "./src/lib/embeddings.js";
import { vectorStore } from "./src/lib/storage/vectorStore.js";

async function main() {
  const question =
    "Como localizar um produto pelo nome na tela de contagem de estoque?";

  console.log("Gerando embedding...");

  const embedding =
    await embeddingService.generate(question);

  console.log("Dimensões:", embedding.length);

  console.log("Executando vectorStore.search()...");

  const results = await vectorStore.search(
    embedding,
    30,
    0,
  );

  console.log("Resultados:", results.length);

  for (const [index, result] of results.slice(0, 5).entries()) {
    console.log("");
    console.log(`#${index + 1}`);
    console.log("score:", result.similarity_score);
    console.log("arquivo:", result.chunk.source_file);
    console.log("chunk:", result.chunk.chunk_index);
    console.log(
      "texto:",
      result.chunk.text.slice(0, 300),
    );
  }
}

main().catch((error) => {
  console.error("");
  console.error("ERRO:");
  console.error(error);
  process.exit(1);
});
