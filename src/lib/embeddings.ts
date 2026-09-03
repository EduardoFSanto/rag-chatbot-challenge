// src/core/embeddings.ts

import { pipeline, env } from "@xenova/transformers";
import { logger } from "./logger.js";

// Configure to use local cache
env.cacheDir = "./.cache";

let embeddingPipeline: any = null;

async function initializePipeline() {
  if (!embeddingPipeline) {
    logger.info("Loading embedding model (first time only, ~90MB download)...");
    embeddingPipeline = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    );
    logger.info("✅ Embedding model loaded");
  }
  return embeddingPipeline;
}

export const embeddingService = {
  async generate(text: string): Promise<number[]> {
    try {
      const pipeline = await initializePipeline();

      const output = await pipeline(text, {
        pooling: "mean",
        normalize: true,
      });

      // Convert to array of numbers
      const embedding = Array.from(output.data) as number[];

      logger.debug(`Generated embedding with ${embedding.length} dimensions`);

      return embedding;
    } catch (error: any) {
      logger.error("Embedding generation failed", error);
      throw {
        code: "EMBEDDING_ERROR",
        message: `Failed to generate embedding: ${error.message || error}`,
        statusCode: 500,
      };
    }
  },
};
