import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../db/index.js";
import { documents } from "../../db/documents.js";
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

      const user = (req as any).user;
      const file = req.file;
      const documentId = uuidv4();

      logger.info(`Processing file: ${file.originalname} (${file.size} bytes)`);

      await db.insert(documents).values({
        id: documentId,
        filename: file.originalname,
        fileSize: file.size,
        userId: user.id,
        qdrantCollection: process.env.COLLECTION_NAME || "vrtech_knowledge",
      });

      const text = await fileParser.extract(file.buffer, file.mimetype);
      const chunks = chunker.chunk(text, file.originalname);

      logger.info(`Generating embeddings for ${chunks.length} chunks...`);
      const embeddedChunks = [];

      for (const chunk of chunks) {
        const embedding = await embeddingService.generate(chunk.text);
        embeddedChunks.push({ ...chunk, embedding });
      }

      await vectorStore.addChunks(embeddedChunks, documentId);

      logger.info(`Successfully processed and stored document: ${documentId}`);

      return res.status(200).json({
        success: true,
        documentId: documentId,
        filename: file.originalname,
        num_chunks: embeddedChunks.length,
        total_chars: text.length,
        message: `Successfully processed ${embeddedChunks.length} chunks`,
      });
    } catch (error) {
      logger.error(`Upload failed: ${error}`);
      next(error);
    }
  },
};