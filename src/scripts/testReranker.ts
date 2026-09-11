import { rerankerService } from "../lib/reranker.js";
import type { SearchResult } from "../types/index.js";

const question = "como fazer contagem de estoque?";

const results: SearchResult[] = [
  {
    chunk: {
      id: "1",
      text: "Para gerar uma nota fiscal de entrada, acesse o módulo de notas fiscais e informe os dados do fornecedor.",
      source_file:
        "Bot Xml - notas de entradas.transcript.txt",
      chunk_index: 0,
      char_start: 0,
      char_end: 120,
      embedding: [],
    },
    similarity_score: 0.45,
  },
  {
    chunk: {
      id: "2",
      text: "A contagem de estoque permite selecionar produtos de determinadas classes, grupos e marcas para realizar a conferência das quantidades em estoque.",
      source_file:
        "Contagem de estoquepor seleções como classe, sub,marca, etc....transcript.txt",
      chunk_index: 2,
      char_start: 0,
      char_end: 150,
      embedding: [],
    },
    similarity_score: 0.44,
  },
  {
    chunk: {
      id: "3",
      text: "A configuração do cadastro de produtos permite definir informações fiscais, comerciais e tributárias.",
      source_file:
        "Cadastro de produtos.transcript.txt",
      chunk_index: 1,
      char_start: 0,
      char_end: 110,
      embedding: [],
    },
    similarity_score: 0.43,
  },
];

async function main() {
  console.log("\n========================================");
  console.log("TESTE DO RERANKER");
  console.log("========================================");

  console.log(`\nPergunta: ${question}`);

  console.log("\nResultados antes do reranking:");

  results.forEach((result, index) => {
    console.log(
      `#${index + 1} | score=${result.similarity_score.toFixed(4)}`,
    );

    console.log(
      `arquivo: ${result.chunk.source_file}`,
    );

    console.log(
      result.chunk.text,
    );

    console.log();
  });

  console.log("\nExecutando reranking...\n");

  const rankedResults =
    await rerankerService.rerank(
      question,
      results,
    );

  console.log("========================================");
  console.log("RESULTADOS APÓS RERANKING");
  console.log("========================================");

  rankedResults.forEach((result, index) => {
    console.log(
      `\n#${index + 1} | score=${result.similarity_score.toFixed(4)}`,
    );

    console.log(
      `arquivo: ${result.chunk.source_file}`,
    );

    console.log(
      `chunk: ${result.chunk.chunk_index}`,
    );

    console.log(
      result.chunk.text,
    );
  });

  console.log("\n========================================");
  console.log("TESTE FINALIZADO");
  console.log("========================================");
}

main().catch((error) => {
  console.error("\nReranker test failed:");
  console.error(error);
  process.exit(1);
});