import { Request, Response, NextFunction } from "express";
import { fileParser } from "../../core/fileParser.js";
import { chunker } from "../../core/chunker.js";
import { embeddingService } from "../../core/embeddings.js";
import { vectorStore } from "../../storage/vectorStore.js";
import { logger } from "../../utils/logger.js";

export const uploadController = {
  async handle(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file provided. Please upload a PDF or TXT file.",
        });
      }

      const file = req.file;
      const filename = file.originalname;

      logger.info(`Processing file: ${filename} (${file.size} bytes)`);

      const text = await fileParser.extract(file.buffer, file.mimetype);
      const chunks = chunker.chunk(text, filename);

      logger.info(`Generating embeddings for ${chunks.length} chunks...`);
      const embeddedChunks = [];

      for (const chunk of chunks) {
        const embedding = await embeddingService.generate(chunk.text);
        embeddedChunks.push({
          ...chunk,
          embedding,
        });
      }

      const fileId = await vectorStore.addChunks(embeddedChunks);
      logger.info(`Stored ${embeddedChunks.length} chunks with file_id: ${fileId}`);

      return res.status(200).json({
        success: true,
        file_id: fileId,
        filename: filename,
        num_chunks: embeddedChunks.length,
        total_chars: text.length,
        message: `Successfully processed ${embeddedChunks.length} chunks`,
      });
    } catch (error) {
      next(error);
    }
  },
};