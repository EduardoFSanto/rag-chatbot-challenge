// src/api/controllers/uploadController.ts

import { Request, Response, NextFunction } from "express";
import { fileParser } from "../../core/fileParser.js";
import { chunker } from "../../core/chunker.js";
import { embeddingService } from "../../core/embeddings.js"; // ⬅️ MUDOU (singular)
import { vectorStore } from "../../storage/vectorStore.js";
import { logger } from "../../utils/logger.js";

export const uploadController = {
  async handle(req: Request, res: Response, next: NextFunction) {
    try {
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          error: "No file provided",
          code: "NO_FILE",
        });
      }

      logger.info(`Processing upload: ${file.originalname} (${file.mimetype})`);

      // Step 1: Extract text
      const text = await fileParser.extract(file.buffer, file.mimetype);
      logger.debug(
        `Extracted ${text.length} characters from ${file.originalname}`,
      );

      // Step 2: Validate extracted text
      if (!text || text.trim().length === 0) {
        return res.status(400).json({
          error: "Uploaded file contains no readable text",
          code: "EMPTY_TEXT",
        });
      }

      // Step 3: Chunk
      const chunks = chunker.chunk(text, file.originalname);
      logger.debug(`Created ${chunks.length} chunks from ${file.originalname}`);

      if (chunks.length === 0) {
        return res.status(400).json({
          error: "File too small to create meaningful chunks",
          code: "NO_CHUNKS_CREATED",
        });
      }

      // Step 4: Embed each chunk
      logger.info(`Generating embeddings for ${chunks.length} chunks...`);
      const embeddedChunks = [];

      for (const chunk of chunks) {
        const embedding = await embeddingService.generate(chunk.text); // ⬅️ MUDOU
        embeddedChunks.push({
          ...chunk,
          embedding,
        });
      }

      // Step 5: Store
      const fileId = vectorStore.addChunks(embeddedChunks);
      logger.info(
        `Stored ${embeddedChunks.length} chunks with file_id: ${fileId}`,
      );

      // Step 6: Response
      return res.status(200).json({
        success: true,
        file_id: fileId,
        filename: file.originalname,
        num_chunks: embeddedChunks.length,
        total_chars: text.length,
        message: `Successfully processed ${embeddedChunks.length} chunks`,
      });
    } catch (error) {
      next(error);
    }
  },
};
