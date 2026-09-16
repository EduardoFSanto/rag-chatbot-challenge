import "dotenv/config";
import { QdrantClient } from "@qdrant/js-client-rest";
import { db } from "../db/index.js";
import { documentChunks } from "../db/schema/documentChunks.js";

const QDRANT_URL =
  process.env.QDRANT_URL || "http://localhost:6333";

const COLLECTION_NAME =
  process.env.COLLECTION_NAME || "vrtech_knowledge";

const BATCH_SIZE = 500;

const client = new QdrantClient({
  url: QDRANT_URL,
});

type QdrantPayload = {
  documentId?: string;
  text?: string;
  source_file?: string;
  chunk_index?: number;
  char_start?: number;
  char_end?: number;
};

type QdrantPoint = {
  id: string | number;
  payload?: QdrantPayload;
};

function isUuid(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function main() {
  console.log("Starting document chunks backfill...");
  console.log(`Qdrant: ${QDRANT_URL}`);
  console.log(`Collection: ${COLLECTION_NAME}`);

  let offset: string | number | undefined;
  let processed = 0;
  let inserted = 0;
  let skipped = 0;

  while (true) {
    const response = await client.scroll(COLLECTION_NAME, {
      limit: BATCH_SIZE,
      offset,
      with_payload: true,
      with_vector: false,
    });

    const points = response.points as QdrantPoint[];

    if (points.length === 0) {
      break;
    }

    const rows = [];

    for (const point of points) {
      processed++;

      const payload = point.payload;

      if (!payload) {
        skipped++;

        console.warn(
          `Skipping point ${point.id}: missing payload`,
        );

        continue;
      }

      const chunkId = String(point.id);

      if (
        !isUuid(chunkId) ||
        !isUuid(payload.documentId) ||
        typeof payload.text !== "string" ||
        typeof payload.chunk_index !== "number" ||
        typeof payload.char_start !== "number" ||
        typeof payload.char_end !== "number"
      ) {
        skipped++;

        console.warn(
          `Skipping point ${point.id}: invalid chunk payload`,
        );

        continue;
      }

      rows.push({
        id: chunkId,
        documentId: payload.documentId,
        text: payload.text,
        chunkIndex: payload.chunk_index,
        charStart: payload.char_start,
        charEnd: payload.char_end,
      });
    }

    if (rows.length > 0) {
      for (
        let index = 0;
        index < rows.length;
        index += BATCH_SIZE
      ) {
        const batch = rows.slice(
          index,
          index + BATCH_SIZE,
        );

        await db
          .insert(documentChunks)
          .values(batch)
          .onConflictDoNothing();

        inserted += batch.length;
      }
    }

    console.log(
      `Processed: ${processed} | Candidates: ${rows.length} | Insert attempts: ${inserted} | Skipped: ${skipped}`,
    );

    const nextOffset = response.next_page_offset;

    if (
      nextOffset === null ||
      nextOffset === undefined
    ) {
      break;
    }

    if (
      typeof nextOffset !== "string" &&
      typeof nextOffset !== "number"
    ) {
      throw new Error(
        `Unexpected Qdrant pagination offset type: ${typeof nextOffset}`,
      );
    }

    offset = nextOffset;
  }

  const countResult = await db
    .select()
    .from(documentChunks);

  console.log("");
  console.log("Backfill completed.");
  console.log(`Processed Qdrant points: ${processed}`);
  console.log(`Inserted attempts: ${inserted}`);
  console.log(`Skipped points: ${skipped}`);
  console.log(
    `PostgreSQL document_chunks rows: ${countResult.length}`,
  );
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});