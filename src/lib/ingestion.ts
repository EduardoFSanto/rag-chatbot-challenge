import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { documents } from "../db/schema/documents.js";
import { fileParser } from "./fileParser.js";
import { chunker } from "./chunker.js";
import { embeddingService } from "./embeddings.js";
import { vectorStore, COLLECTION_NAME } from "../lib/storage/vectorStore.js";
import { logger } from "../lib/logger.js";

export interface IngestInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  fileSize: number;
  userId: string;
}

export type IngestResult =
  | { outcome: "duplicate"; documentId: string }
  | { outcome: "processed"; documentId: string; numChunks: number; totalChars: number };

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as { code?: string; cause?: { code?: string } };
  return err.code === "23505" || err.cause?.code === "23505";
}

export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  const fileHash = crypto.createHash("sha256").update(input.buffer).digest("hex");

  const existing = await db.query.documents.findFirst({
    where: eq(documents.fileHash, fileHash),
  });

  let documentId: string;

  if (existing) {
    if (existing.status !== "failed") {
      return { outcome: "duplicate", documentId: existing.id };
    }

    logger.info(`Retrying failed ingestion for document ${existing.id}`);
    await vectorStore.deleteByDocumentId(existing.id);
    await db
      .update(documents)
      .set({ status: "processing" })
      .where(eq(documents.id, existing.id));
    documentId = existing.id;
  } else {
    try {
      const [created] = await db
        .insert(documents)
        .values({
          filename: input.filename,
          fileHash,
          fileSize: input.fileSize,
          userId: input.userId,
          qdrantCollection: COLLECTION_NAME,
        })
        .returning();
      documentId = created.id;
    } catch (error) {
      if (isUniqueViolation(error)) {
        const concurrent = await db.query.documents.findFirst({
          where: eq(documents.fileHash, fileHash),
        });
        return { outcome: "duplicate", documentId: concurrent?.id ?? "unknown" };
      }
      throw error;
    }
  }

  try {
    const text = await fileParser.extract(input.buffer, input.mimeType);
    const chunks = chunker.chunk(text, input.filename);

    logger.info(`Generating embeddings for ${chunks.length} chunks (document ${documentId})`);
    const embeddedChunks = [];
    for (const chunk of chunks) {
      const embedding = await embeddingService.generate(chunk.text);
      embeddedChunks.push({ ...chunk, embedding });
    }

    await vectorStore.addChunks(embeddedChunks, documentId);

    await db
      .update(documents)
      .set({ status: "processed" })
      .where(eq(documents.id, documentId));

    logger.info(`Document ${documentId} processed successfully`);
    return {
      outcome: "processed",
      documentId,
      numChunks: embeddedChunks.length,
      totalChars: text.length,
    };
  } catch (error) {
    await vectorStore.deleteByDocumentId(documentId).catch((cleanupError) => {
      logger.error(`Compensation cleanup failed for document ${documentId}: ${cleanupError}`);
    });

    await db
      .update(documents)
      .set({ status: "failed" })
      .where(eq(documents.id, documentId));

    logger.error(`Ingestion failed for document ${documentId}: ${error}`);
    throw error;
  }
}