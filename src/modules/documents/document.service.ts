import { eq, and } from "drizzle-orm";
import { db } from "../../db/index.js";
import { documents } from "../../db/schema/documents.js";
import { vectorStore } from "../../lib/storage/vectorStore.js";
import { ingestDocument, type IngestInput, type IngestResult } from "../../lib/ingestion.js";
import { logger } from "../../lib/logger.js";

export const documentService = {
  async ingest(input: IngestInput): Promise<IngestResult> {
    return ingestDocument(input);
  },

  async delete(documentId: string, userId: string): Promise<void> {
    const doc = await db.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.userId, userId)),
    });

    if (!doc) {
      throw new Error("Document not found or access denied");
    }

    await vectorStore.deleteByDocumentId(documentId);
    await db.delete(documents).where(and(eq(documents.id, documentId), eq(documents.userId, userId)));

    logger.info(`Document ${documentId} deleted by user ${userId}`);
  },
};