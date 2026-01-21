// src/utils/config.ts

import { config as dotenvConfig } from "dotenv";

dotenvConfig();

export const config = {
  // Server
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  logLevel: process.env.LOG_LEVEL || "info",

  // Gemini API
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    embeddingModel: "embedding-001",
    llmModel: "gemini-pro",
  },

  // RAG parameters
  rag: {
    chunkSize: 2000, // characters
    chunkOverlap: 500, // characters
    minChunkLength: 50, // skip tiny chunks
    retrievalK: 5, // top K chunks to retrieve
    similarityThreshold: 0.7, // cosine similarity threshold
    llmTemperature: 0.1, // low = factual, high = creative
    maxQuestionLength: 5000, // characters
  },

  // File upload
  upload: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ["application/pdf", "text/plain"],
  },
};

// Validation: check required env vars
if (!config.gemini.apiKey) {
  throw new Error("GEMINI_API_KEY environment variable is required");
}
