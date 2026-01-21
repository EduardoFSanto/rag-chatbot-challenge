// src/server.ts

import { createApp } from "./app.js";
import { config } from "./utils/config.js";
import { logger } from "./utils/logger.js";

const app = createApp();

console.log("🔍 DEBUG: About to start server on port", config.port);

app.listen(config.port, () => {
  console.log("✅ Server started!");
  logger.info(`🚀 Server running on port ${config.port} (${config.nodeEnv})`);
  logger.info(`📚 Health check: http://localhost:${config.port}/health`);
  logger.info(`📤 Upload endpoint: http://localhost:${config.port}/api/upload`);
  logger.info(`❓ Query endpoint: http://localhost:${config.port}/api/ask`);
  logger.debug("Configuration:", {
    llmProvider: "Groq",
    llmModel: config.groq.model,
    embeddingProvider: "Local (Transformers.js)",
    embeddingModel: config.embeddings.model,
    chunkSize: config.rag.chunkSize,
    retrievalK: config.rag.retrievalK,
    similarityThreshold: config.rag.similarityThreshold,
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  process.exit(0);
});
