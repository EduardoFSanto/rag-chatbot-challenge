import { Request, Response, NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { QdrantClient } from "@qdrant/js-client-rest";
import { db } from "../../db/index.js";
import { documents } from "../../db/documents.js";
import { createSuccessResponse, createErrorResponse } from "../../utils/apiResponse.js";
import { logger } from "../../utils/logger.js";

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || "http://localhost:6333" });
const COLLECTION_NAME = process.env.COLLECTION_NAME || "vrtech_knowledge";

export const documentController = {
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json(createErrorResponse("UNAUTHORIZED", "Unauthorized"));
      }

      const { id } = req.params;

      const doc = await db.query.documents.findFirst({
        where: and(eq(documents.id, id), eq(documents.userId, user.id)),
      });

      if (!doc) {
        return res.status(404).json(
          createErrorResponse("NOT_FOUND", "Document not found or access denied")
        );
      }

      await qdrant.delete(COLLECTION_NAME, {
        filter: {
          must: [{ key: "documentId", match: { value: id } }],
        },
      });

      await db.delete(documents).where(and(eq(documents.id, id), eq(documents.userId, user.id)));

      logger.info(`Document ${id} deleted by user ${user.id}`);

      return res.status(200).json(
        createSuccessResponse({ message: "Document and associated vectors deleted successfully" })
      );
    } catch (error) {
      logger.error(`Delete document failed: ${error}`);
      next(error);
    }
  },
};