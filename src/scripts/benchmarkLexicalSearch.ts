import { lexicalSearchService } from "../lib/search/lexicalSearch.js";

interface BenchmarkQuestion {
  question: string;
  expectedFiles: string[];
}

const TOP_K = 30;

const questions: BenchmarkQuestion[] = [
  {
    question: "como ajustar o estoque no etrade?",
    expectedFiles: [
      "Contagem de estoquepor seleçõescomo classe, sub,marca, etc....transcript.txt",
      "Web - Contagem de estoque com leitor de código pelo celular.transcript.txt",
      "Contar estoque utilizando celular.transcript.txt",
    ],
  },
  {
    question: "contagem de estoque",
    expectedFiles: [
      "Contagem de estoquepor seleçõescomo classe, sub,marca, etc....transcript.txt",
      "Web - Contagem de estoque com leitor de código pelo celular.transcript.txt",
      "Contar estoque utilizando celular.transcript.txt",
    ],
  },
  {
    question: "como fazer contagem de estoque?",
    expectedFiles: [
      "Contagem de estoquepor seleçõescomo classe, sub,marca, etc....transcript.txt",
      "Web - Contagem de estoque com leitor de código pelo celular.transcript.txt",
      "Contar estoque utilizando celular/transcript.txt",
    ],
  },
  {
    question: "contagem de estoque no etrade",
    expectedFiles: [
      "Contagem de estoquepor seleçõescomo classe, sub,marca, etc....transcript.txt",
      "Web - Contagem de estoque com leitor de código pelo celular.transcript.txt",
      "Contar estoque utilizando celular.transcript.txt",
    ],
  },
  {
    question: "ajustar estoque através da contagem de estoque",
    expectedFiles: [
      "Contagem de estoquepor seleçõescomo classe, sub,marca, etc....transcript.txt",
      "Web - Contagem de estoque com leitor de código pelo celular.transcript.txt",
      "Contar estoque utilizando celular.transcript.txt",
    ],
  },
  {
    question: "gerar movimento de entrada e saída na contagem de estoque",
    expectedFiles: [
      "Gerar movimento entrada e saída na contagem de estoque.transcript.txt",
      "Contagem de estoquepor seleçõescomo classe, sub,marca, etc....transcript.txt",
    ],
  },
];

function normalizeFilename(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[áàãâä]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i")
    .replace(/[óòõôö]/g, "o")
    .replace(/[úùûü]/g, "u")
    .replace(/ç/g, "c");
}

function isExpectedFile(
  filename: string,
  expectedFiles: string[],
): boolean {
  const normalizedFilename = normalizeFilename(filename);

  return expectedFiles.some(
    (expectedFile) =>
      normalizedFilename === normalizeFilename(expectedFile),
  );
}

function findRank(
  results: Awaited<
    ReturnType<typeof lexicalSearchService.search>
  >,
  expectedFiles: string[],
): number | null {
  const index = results.findIndex((result) =>
    isExpectedFile(result.chunk.source_file, expectedFiles),
  );

  return index === -1 ? null : index + 1;
}

function printTopResults(
  results: Awaited<
    ReturnType<typeof lexicalSearchService.search>
  >,
) {
  results.slice(0, 10).forEach((result, index) => {
    console.log(
      `#${index + 1} | score=${result.lexical_score.toFixed(4)} | ${result.chunk.source_file} | chunk=${result.chunk.chunk_index}`,
    );
  });
}

async function main() {
  console.log("\n========================================");
  console.log("BENCHMARK LEXICAL SEARCH");
  console.log("========================================");

  console.log(`Top K: ${TOP_K}`);

  let success = 0;

  for (const benchmark of questions) {
    console.log("\n\n========================================");
    console.log(`PERGUNTA: ${benchmark.question}`);
    console.log("========================================");

    const results = await lexicalSearchService.search(
      benchmark.question,
      TOP_K,
    );

    const rank = findRank(
      results,
      benchmark.expectedFiles,
    );

    if (rank === null) {
      console.log(
        `❌ Documento esperado NÃO encontrado no Top ${TOP_K}`,
      );
    } else {
      console.log(
        `✅ Melhor documento esperado: posição #${rank}`,
      );
      success++;
    }

    console.log("\nTOP RESULTADOS:");
    console.log("----------------------------------------");

    printTopResults(results);
  }

  console.log("\n\n========================================");
  console.log("RESULTADO FINAL");
  console.log("========================================");

  console.log(
    `Recall@${TOP_K}: ${success}/${questions.length} (${(
      (success / questions.length) *
      100
    ).toFixed(1)}%)`,
  );

  console.log("\n========================================");
  console.log("BENCHMARK FINALIZADO");
  console.log("========================================");
}

main().catch((error) => {
  console.error("\nBenchmark failed:");
  console.error(error);
  process.exit(1);
});