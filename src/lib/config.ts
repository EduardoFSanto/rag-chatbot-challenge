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

    retrievalK: 30,
    finalK: 5,

    similarityThreshold: 0.3,

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