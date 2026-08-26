import { Request, Response, NextFunction } from "express";
import { embeddingService } from "../../core/embeddings.js";
import { vectorStore } from "../../storage/vectorStore.js";
import { promptService } from "../../core/prompt.js";
import { llmService } from "../../core/llm.js";
import { logger } from "../../utils/logger.js";
import { config } from "../../utils/config.js";

export const queryController = {
  async handle(req: Request, res: Response, next: NextFunction) {
    try {
      const { question } = req.body;

      logger.info(`Processing query: "${question.substring(0, 50)}..."`);

      // Step 1: Check if vector store is initialized
      if (await vectorStore.isEmpty()) {
        return res.status(200).json({
          success: true,
          answer: null,
          status: "no_documents",
          message: "No documents have been uploaded yet. Please upload documents first.",
          sources: [],
          retrieval_stats: {
            chunks_retrieved: 0,
            threshold_used: config.rag.similarityThreshold,
            total_chunks_in_store: 0,
          },
        });
      }

      // Step 2: Embed question
      logger.debug("Generating question embedding...");
      const questionEmbedding = await embeddingService.generate(question);

      // Step 3: Retrieve chunks
      const retrievedChunks = await vectorStore.search(
        questionEmbedding,
        config.rag.retrievalK,
        config.rag.similarityThreshold,
      );

      logger.debug(`Retrieved ${retrievedChunks.length} relevant chunks`);

      // Step 4: Check if anything was found
      if (retrievedChunks.length === 0) {
        return res.status(200).json({
          success: true,
          answer: null,
          status: "insufficient_context",
          message: "No sufficiently relevant chunks found. Please try rephrasing your question or upload relevant documents.",
          sources: [],
          retrieval_stats: {
            chunks_retrieved: 0,
            threshold_used: config.rag.similarityThreshold,
            total_chunks_in_store: await vectorStore.count(),
          },
        });
      }

      // Step 5: Build prompt
      const prompt = promptService.build(question, retrievedChunks);

      // Step 6: Call LLM
      logger.info("Generating answer with LLM...");
      const answer = await llmService.generate(prompt);

      // Step 7: Format response with citations
      const sources = retrievedChunks.map((result) => ({
        filename: result.chunk.source_file,
        chunk_index: result.chunk.chunk_index,
        similarity_score: Math.round(result.similarity_score * 100) / 100,
        snippet: result.chunk.text.substring(0, 150) + (result.chunk.text.length > 150 ? "..." : ""),
      }));

      logger.info(`Successfully generated answer with ${sources.length} sources`);

      return res.status(200).json({
        success: true,
        answer,
        status: "success",
        sources,
        retrieval_stats: {
          chunks_retrieved: retrievedChunks.length,
          threshold_used: config.rag.similarityThreshold,
          total_chunks_in_store: await vectorStore.count(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
