export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  logLevel: process.env.LOG_LEVEL || "info",

  groq: {
    apiKey: process.env.GROQ_API_KEY || "",
    model: "openai/gpt-oss-20b",
  },

  embeddings: {
    model: "Xenova/all-MiniLM-L6-v2",
    dimensions: 384,
  },

  rag: {
    chunkSize: 2000,
    chunkOverlap: 500,
    minChunkLength: 50,

    // Two-stage retrieval:
    // 1) retrieve a broad candidate set with dense + lexical search
    // 2) rerank the candidates and send only the strongest chunks to the LLM
    retrievalK: 30,
    rerankerK: 12,
    finalK: 5,

    // Dense retrieval guardrail. Lexical evidence has its own threshold
    // because PostgreSQL ts_rank scores are not directly comparable to
    // cosine similarity.
    similarityThreshold: 0.3,
    lexicalEvidenceThreshold: 0.05,

    // RRF weights are intentionally configurable so they can be calibrated
    // with the evaluation dataset instead of being magic numbers.
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

if (!config.groq.apiKey && config.nodeEnv !== "test") {
  throw new Error("GROQ_API_KEY environment variable is required");
}
