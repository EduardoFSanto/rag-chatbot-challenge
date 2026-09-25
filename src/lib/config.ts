export type LlmProvider = "groq" | "openai";

const llmProvider = (process.env.LLM_PROVIDER || "groq") as LlmProvider;

if (!["groq", "openai"].includes(llmProvider)) {
  throw new Error(
    `Unsupported LLM_PROVIDER "${llmProvider}". Use "groq" or "openai".`,
  );
}

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  logLevel: process.env.LOG_LEVEL || "info",

  llm: {
    provider: llmProvider,
    groq: {
      apiKey: process.env.GROQ_API_KEY || "",
      model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || "",
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    },
    maxOutputTokens: Number(
      process.env.LLM_MAX_OUTPUT_TOKENS || 2048,
    ),
  },

  embeddings: {
    model: "Xenova/all-MiniLM-L6-v2",
    dimensions: 384,
  },

  rag: {
    chunkSize: 2000,
    chunkOverlap: 500,
    minChunkLength: 50,

    // Candidate generation is intentionally broader than the final context.
    // Retrieval creates coverage; reranking decides what reaches the LLM.
    retrievalK: 60,
    rerankerK: 30,
    finalK: 5,

    similarityThreshold: 0.3,
    lexicalEvidenceThreshold: 0.05,

    rrfK: 60,
    rrfDenseWeight: 1,
    rrfLexicalWeight: 1.5,

    llmTemperature: 0.1,
    maxQuestionLength: 5000,
  },

  upload: {
    maxFileSize: 10 * 1024 * 1024,
    allowedMimeTypes: ["application/pdf", "text/plain"],
  },
};

if (config.llm.provider === "groq" && !config.llm.groq.apiKey && config.nodeEnv !== "test") {
  throw new Error("GROQ_API_KEY environment variable is required when LLM_PROVIDER=groq");
}

if (config.llm.provider === "openai" && !config.llm.openai.apiKey && config.nodeEnv !== "test") {
  throw new Error("OPENAI_API_KEY environment variable is required when LLM_PROVIDER=openai");
}
