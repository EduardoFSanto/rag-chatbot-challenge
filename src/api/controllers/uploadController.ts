import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { documents } from "../../db/documents.js";
import { fileParser } from "../../core/fileParser.js";
import { chunker } from "../../core/chunker.js";
import { embeddingService } from "../../core/embeddings.js";
import { vectorStore } from "../../storage/vectorStore.js";
import { logger } from "../../utils/logger.js";
import { createSuccessResponse, createErrorResponse } from "../../utils/apiResponse.js";

export const uploadController = {
  async handle(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json(createErrorResponse("UNAUTHORIZED", "Unauthorized"));
      }

      if (!req.file) {
        return res.status(400).json(
          createErrorResponse("BAD_REQUEST", "No file provided. Please upload a PDF or TXT file.")
        );
      }

      const file = req.file;
      const fileHash = crypto.createHash("sha256").update(file.buffer).digest("hex");

      const existingDoc = await db.query.documents.findFirst({
        where: eq(documents.fileHash, fileHash),
      });

      if (existingDoc) {
        logger.info(`Duplicate file detected (hash: ${fileHash}). Skipping processing.`);
        return res.status(409).json(
          createErrorResponse("CONFLICT", `File "${file.originalname}" has already been processed.`)
        );
      }

      const documentId = uuidv4();
      const collectionName = `doc_${documentId}`;

      logger.info(`Processing new file: ${file.originalname} (${file.size} bytes)`);

      await db.insert(documents).values({
        id: documentId,
        filename: file.originalname,
        fileHash,
        fileSize: file.size,
        userId: user.id,
        qdrantCollection: collectionName,
        status: "processed",
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

      return res.status(200).json(
        createSuccessResponse({
          documentId,
          filename: file.originalname,
          numChunks: embeddedChunks.length,
          totalChars: text.length,
        })
      );
    } catch (error) {
      logger.error(`Upload failed: ${error}`);
      next(error);
    }
  },
};