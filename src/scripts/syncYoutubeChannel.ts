import "dotenv/config";
import youtubedl from "youtube-dl-exec";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { user } from "../db/schema/auth.js";
import { ingestDocument } from "../lib/ingestion.js";
import { youtubeService } from "../lib/youtube.js";
import { logger } from "../lib/logger.js";

type YoutubeDl = (url: string, flags: Record<string, unknown>) => Promise<unknown>;
const runYoutubeDl = youtubedl as unknown as YoutubeDl;

interface PlaylistEntry {
  id: string;
  title?: string;
  url?: string;
}

function timestamp(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 3600)).padStart(2, "0")}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

async function main() {
  const channelUrl = process.argv[2];
  const email = process.env.YOUTUBE_IMPORT_USER_EMAIL;
  if (!channelUrl || !email) throw new Error("Use: npm run videos:sync -- <channel-url> with YOUTUBE_IMPORT_USER_EMAIL configured");

  const account = await db.query.user.findFirst({ where: eq(user.email, email), columns: { id: true } });
  if (!account) throw new Error(`User not found: ${email}`);

  const playlist = await runYoutubeDl(`${channelUrl.replace(/\/$/, "")}/videos`, {
    flatPlaylist: true,
    dumpSingleJson: true,
    skipDownload: true,
    noWarnings: true,
    noCheckCertificates: true,
  }) as unknown as { entries?: PlaylistEntry[] };
  const entries = (playlist.entries || []).filter((entry) => entry.id);
  logger.info(`Found ${entries.length} YouTube videos to synchronize`);

  let processed = 0;
  let failed = 0;
  for (const [index, entry] of entries.entries()) {
    const url = `https://www.youtube.com/watch?v=${entry.id}`;
    try {
      logger.info(`[${index + 1}/${entries.length}] Importing ${entry.title || entry.id}`);
      const video = await youtubeService.transcribe(url);
      const transcript = video.segments.map((segment) => `[${timestamp(segment.offset)}] ${segment.text.trim()}`).join("\n\n");
      const buffer = Buffer.from(transcript, "utf8");
      const result = await ingestDocument({
        buffer,
        filename: `${video.metadata.title}.transcript.txt`,
        mimeType: "text/plain",
        fileSize: buffer.byteLength,
        userId: account.id,
        visibility: "private",
        sourceType: "youtube",
        sourceUrl: video.metadata.webpage_url || url,
        externalId: video.externalId,
        publishedAt: youtubeService.parseDate(video.metadata.upload_date),
        durationSeconds: video.metadata.duration,
        language: video.metadata.language || "pt",
      });
      if (result.outcome === "processed") processed++;
      logger.info(`[${index + 1}/${entries.length}] ${result.outcome}`);
    } catch (error) {
      failed++;
      logger.error(`Failed to import ${entry.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  logger.info(`YouTube synchronization finished: ${processed} processed, ${failed} failed`);
}

main().catch((error) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
