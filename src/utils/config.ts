import { config as dotenvConfig } from "dotenv";

dotenvConfig();

export const config = {
  // Server
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  logLevel: process.env.LOG_LEVEL || "info",

  // Groq LLM
  groq: {
    apiKey: process.env.GROQ_API_KEY || "",
    model: "openai/gpt-oss-20b", // Modelo estável e com acesso garantido no Groq
  },

  // Embeddings (local model, no API needed)
  embeddings: {
    model: "Xenova/all-MiniLM-L6-v2", // Runs locally
    dimensions: 384, // Output dimension
  },

  // RAG parameters
  rag: {
    chunkSize: 2000,
    chunkOverlap: 500,
    minChunkLength: 50,
    retrievalK: 5,
    similarityThreshold: 0.3,
    llmTemperature: 0.1,
    maxQuestionLength: 5000,
  },

  // File upload
  upload: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ["application/pdf", "text/plain"],
  },
};

// Validation: check required env vars
if (!config.groq.apiKey) {
  throw new Error("GROQ_API_KEY environment variable is required");
}