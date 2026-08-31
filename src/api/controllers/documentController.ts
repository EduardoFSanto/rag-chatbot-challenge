import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
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
      const { id } = req.params;
      const user = (req as any).user;

      // 1. Verificar se o documento existe e pertence ao usuário (Segurança)
      const doc = await db.query.documents.findFirst({
        where: eq(documents.id, id), // Adicione: and(eq(documents.userId, user.id)) se quiser restringir ao dono
      });

      if (!doc) {
        return res.status(404).json(createErrorResponse("NOT_FOUND", "Document not found"));
      }

      // 2. Deletar os vetores correspondentes no Qdrant (Filtrando pelo documentId no payload)
      await qdrant.delete(COLLECTION_NAME, {
        filter: {
          must: [{ key: "documentId", match: { value: id } }],
        },
      });

      // 3. Deletar os metadados do PostgreSQL
      await db.delete(documents).where(eq(documents.id, id));

      logger.info(`Document ${id} deleted successfully from Postgres and Qdrant`);

      return res.status(200).json(
        createSuccessResponse({ message: "Document and associated vectors deleted successfully" })
      );
    } catch (error) {
      logger.error(`Delete document failed: ${error}`);
      next(error);
    }
  },
};