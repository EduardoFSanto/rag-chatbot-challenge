import { embeddingService } from "../lib/embeddings.js";
import { vectorStore } from "../lib/storage/vectorStore.js";

const questions = [
  "como ajustar o estoque no etrade?",
  "contagem de estoque",
  "como fazer contagem de estoque?",
  "contagem de estoque no etrade",
  "ajustar estoque através da contagem de estoque",
  "gerar movimento de entrada e saída na contagem de estoque",
];

for (const question of questions) {
  console.log("\n========================================");
  console.log(`PERGUNTA: ${question}`);
  console.log("========================================");

  const embedding = await embeddingService.generate(question);

  const results = await vectorStore.search(
    embedding,
    5,
    0.0,
  );

  for (const [index, result] of results.entries()) {
    console.log(
      `\n#${index + 1} | score=${result.similarity_score.toFixed(4)}`,
    );

    console.log(`arquivo: ${result.chunk.source_file}`);
    console.log(`chunk: ${result.chunk.chunk_index}`);

    console.log(
      result.chunk.text.substring(0, 500).replace(/\n/g, " "),
    );
  }
}

