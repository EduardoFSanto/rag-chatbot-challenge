import { createApp } from "./app.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { documentService } from "./modules/documents/document.service.js";

async function bootstrap() {
  const staleCount = await documentService.recoverStale();
  if (staleCount > 0) {
    logger.info(`Recovered ${staleCount} stale document(s) on boot`);
  }

  const app = createApp();

  console.log("🔍 DEBUG: About to start server on port", config.port);

  app.listen(config.port, () => {
    console.log("✅ Server started!");
    logger.info(`🚀 Server running on port ${config.port} (${config.nodeEnv})`);
    logger.info(`📚 Health check: http://localhost:${config.port}/health`);
    logger.info(`📤 Upload endpoint: http://localhost:${config.port}/api/documents/upload`);
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
}

bootstrap().catch((error) => {
  logger.error(`Failed to start server: ${error}`);
  process.exit(1);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  process.exit(0);
});