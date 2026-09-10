import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { documents } from "../db/schema/documents.js";
import { ingestDocument } from "../lib/ingestion.js";
import { youtubeService } from "../lib/youtube.js";
import { logger } from "../lib/logger.js";

const MIN_TRANSCRIPT_LENGTH = 100;

function timestamp(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));

  return `${String(Math.floor(total / 3600)).padStart(2, "0")}:${String(
    Math.floor((total % 3600) / 60),
  ).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

async function main() {
  const failedDocuments = await db.query.documents.findMany({
    where: and(
      eq(documents.sourceType, "youtube"),
      eq(documents.status, "failed"),
    ),
  });

  logger.info(
    `Found ${failedDocuments.length} failed YouTube documents to retry`,
  );

  if (failedDocuments.length === 0) {
    logger.info("No failed YouTube documents found");
    return;
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const [index, document] of failedDocuments.entries()) {
    if (!document.externalId) {
      skipped++;
      logger.warn(
        `[${index + 1}/${failedDocuments.length}] Skipping document ${document.id}: missing externalId`,
      );
      continue;
    }

    const url = `https://www.youtube.com/watch?v=${document.externalId}`;

    try {
      logger.info(
        `[${index + 1}/${failedDocuments.length}] Retrying ${document.externalId}: ${document.filename}`,
      );

      const video = await youtubeService.transcribe(url);

      if (video.text.length < MIN_TRANSCRIPT_LENGTH) {
        skipped++;

        logger.warn(
          `[${index + 1}/${failedDocuments.length}] Skipping ${document.externalId}: transcript too short (${video.text.length} chars)`,
        );

        continue;
      }

      const transcript = video.segments
        .map(
          (segment) =>
            `[${timestamp(segment.offset)}] ${segment.text.trim()}`,
        )
        .filter(Boolean)
        .join("\n\n");

      const buffer = Buffer.from(transcript, "utf8");

      const result = await ingestDocument({
        buffer,
        filename: `${video.metadata.title}.transcript.txt`,
        mimeType: "text/plain",
        fileSize: buffer.byteLength,
        userId: document.userId,
        visibility: document.visibility,
        sourceType: "youtube",
        sourceUrl: video.metadata.webpage_url || url,
        externalId: video.externalId,
        publishedAt: youtubeService.parseDate(video.metadata.upload_date),
        durationSeconds: video.metadata.duration,
        language: video.metadata.language || "pt",
      });

      if (result.outcome === "processed") {
        processed++;

        logger.info(
          `[${index + 1}/${failedDocuments.length}] ${document.externalId} processed successfully`,
        );
      } else {
        skipped++;

        logger.warn(
          `[${index + 1}/${failedDocuments.length}] ${document.externalId} returned outcome: ${result.outcome}`,
        );
      }
    } catch (error) {
      failed++;

      logger.error(
        `[${index + 1}/${failedDocuments.length}] Failed to retry ${document.externalId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  logger.info(
    `YouTube retry finished: ${processed} processed, ${skipped} skipped, ${failed} failed`,
  );
}

main().catch((error) => {
  logger.error(
    error instanceof Error ? error.stack || error.message : String(error),
  );

  process.exitCode = 1;
});
