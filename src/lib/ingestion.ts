import crypto from "crypto";
import { and, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { documents } from "../db/schema/documents.js";
import { documentChunks } from "../db/schema/documentChunks.js";
import { documentSectors } from "../db/schema/sectors.js";
import type { DocumentVisibility } from "../db/schema/documents.js";

import { fileParser } from "./fileParser.js";
import { chunker } from "./chunker.js";
import { embeddingService } from "./embeddings.js";

import {
  vectorStore,
  COLLECTION_NAME,
} from "../lib/storage/vectorStore.js";

import { logger } from "../lib/logger.js";

export interface IngestInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  fileSize: number;
  userId: string;
  visibility?: DocumentVisibility;
  sectorIds?: string[];
  sourceType?: "file" | "youtube";
  sourceUrl?: string;
  externalId?: string;
  publishedAt?: Date;
  durationSeconds?: number;
  language?: string;
}

export type IngestResult =
  | {
      outcome: "duplicate";
      documentId: string;
    }
  | {
      outcome: "processed";
      documentId: string;
      numChunks: number;
      totalChars: number;
    };

function isUniqueViolation(error: unknown): boolean {
  if (
    typeof error !== "object" ||
    error === null
  ) {
    return false;
  }

  const err = error as {
    code?: string;
    cause?: {
      code?: string;
    };
  };

  return (
    err.code === "23505" ||
    err.cause?.code === "23505"
  );
}

export async function ingestDocument(
  input: IngestInput,
): Promise<IngestResult> {
  const fileHash = crypto
    .createHash("sha256")
    .update(input.buffer)
    .digest("hex");

  const sourceType =
    input.sourceType ?? "file";

  const existing = input.externalId
    ? await db.query.documents.findFirst({
        where: and(
          eq(
            documents.sourceType,
            sourceType,
          ),
          eq(
            documents.externalId,
            input.externalId,
          ),
        ),
      })
    : await db.query.documents.findFirst({
        where: eq(
          documents.fileHash,
          fileHash,
        ),
      });

  let documentId: string;

  if (existing) {
    if (existing.userId !== input.userId) {
      return {
        outcome: "duplicate",
        documentId: existing.id,
      };
    }

    if (existing.status !== "failed") {
      return {
        outcome: "duplicate",
        documentId: existing.id,
      };
    }

    logger.info(
      `Retrying failed ingestion for document ${existing.id}`,
    );

    await vectorStore.deleteByDocumentId(
      existing.id,
    );

    await db
      .delete(documentChunks)
      .where(
        eq(
          documentChunks.documentId,
          existing.id,
        ),
      );

    await db
      .update(documents)
      .set({
        filename: input.filename,
        fileHash,
        fileSize: input.fileSize,
        sourceUrl: input.sourceUrl,
        publishedAt: input.publishedAt,
        durationSeconds:
          input.durationSeconds,
        language: input.language,
        status: "processing",
      })
      .where(
        eq(
          documents.id,
          existing.id,
        ),
      );

    documentId = existing.id;
  } else {
    try {
      const createdDocument =
        await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(documents)
            .values({
              filename: input.filename,
              fileHash,
              fileSize: input.fileSize,
              userId: input.userId,
              qdrantCollection:
                COLLECTION_NAME,
              visibility:
                input.visibility ?? "private",
              sourceType,
              sourceUrl:
                input.sourceUrl,
              externalId:
                input.externalId,
              publishedAt:
                input.publishedAt,
              durationSeconds:
                input.durationSeconds,
              language:
                input.language,
            })
            .returning();

          if (
            input.sectorIds &&
            input.sectorIds.length > 0
          ) {
            await tx
              .insert(documentSectors)
              .values(
                input.sectorIds.map(
                  (sectorId) => ({
                    documentId:
                      created.id,
                    sectorId,
                  }),
                ),
              );
          }

          return created;
        });

      documentId = createdDocument.id;
    } catch (error) {
      if (isUniqueViolation(error)) {
        const concurrent =
          input.externalId
            ? await db.query.documents.findFirst({
                where: and(
                  eq(
                    documents.sourceType,
                    sourceType,
                  ),
                  eq(
                    documents.externalId,
                    input.externalId,
                  ),
                ),
              })
            : await db.query.documents.findFirst({
                where: eq(
                  documents.fileHash,
                  fileHash,
                ),
              });

        return {
          outcome: "duplicate",
          documentId:
            concurrent?.id ?? "unknown",
        };
      }

      throw error;
    }
  }

  try {
    const text =
      await fileParser.extract(
        input.buffer,
        input.mimeType,
      );

    const chunks =
      chunker.chunk(
        text,
        input.filename,
      );

    if (chunks.length === 0) {
      throw new Error(
        "Document produced no valid chunks",
      );
    }

    logger.info(
      `Generating embeddings for ${chunks.length} chunks (document ${documentId})`,
    );

    const embeddedChunks = [];

    for (const chunk of chunks) {
      const embedding =
        await embeddingService.generate(
          chunk.text,
        );

      embeddedChunks.push({
        ...chunk,
        embedding,
      });
    }

    /*
     * PostgreSQL is the source of truth for chunks.
     *
     * IDs are generated here first and the same IDs
     * are subsequently used as Qdrant point IDs.
     */
    const chunkRows =
      await db
        .insert(documentChunks)
        .values(
          embeddedChunks.map(
            (chunk) => ({
              documentId,
              text: chunk.text,
              chunkIndex:
                chunk.chunk_index,
              charStart:
                chunk.char_start,
              charEnd:
                chunk.char_end,
            }),
          ),
        )
        .returning({
          id: documentChunks.id,
          chunkIndex:
            documentChunks.chunkIndex,
        });

    if (
      chunkRows.length !==
      embeddedChunks.length
    ) {
      throw new Error(
        `Chunk persistence mismatch: expected ${embeddedChunks.length}, inserted ${chunkRows.length}`,
      );
    }

    const persistedChunks =
      embeddedChunks.map(
        (chunk, index) => ({
          ...chunk,
          id:
            chunkRows[index].id,
        }),
      );

    await vectorStore.addChunks(
      persistedChunks,
      documentId,
      {
        visibility:
          input.visibility ??
          "private",
        sectorIds:
          input.sectorIds ?? [],
        sourceType,
        sourceUrl:
          input.sourceUrl,
        externalId:
          input.externalId,
      },
    );

    await db
      .update(documents)
      .set({
        status: "processed",
      })
      .where(
        eq(
          documents.id,
          documentId,
        ),
      );

    logger.info(
      `Document ${documentId} processed successfully`,
    );

    return {
      outcome: "processed",
      documentId,
      numChunks:
        persistedChunks.length,
      totalChars: text.length,
    };
  } catch (error) {
    await vectorStore
      .deleteByDocumentId(documentId)
      .catch((cleanupError) => {
        logger.error(
          `Qdrant cleanup failed for document ${documentId}: ${cleanupError}`,
        );
      });

    await db
      .delete(documentChunks)
      .where(
        eq(
          documentChunks.documentId,
          documentId,
        ),
      )
      .catch((cleanupError) => {
        logger.error(
          `PostgreSQL chunk cleanup failed for document ${documentId}: ${cleanupError}`,
        );
      });

    await db
      .update(documents)
      .set({
        status: "failed",
      })
      .where(
        eq(
          documents.id,
          documentId,
        ),
      );

    logger.error(
      `Ingestion failed for document ${documentId}: ${error}`,
    );

    throw error;
  }
}