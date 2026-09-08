import { Request, Response, NextFunction } from "express";
import { createErrorResponse, createSuccessResponse } from "../../lib/apiResponse.js";
import { ingestDocument } from "../../lib/ingestion.js";
import { youtubeService } from "../../lib/youtube.js";

function timestamp(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 3600)).padStart(2, "0")}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export const videoController = {
  async import(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json(createErrorResponse("UNAUTHORIZED", "Unauthorized"));
      const { url, visibility = "private" } = req.body as { url?: string; visibility?: "private" | "company" };
      if (!url) return res.status(400).json(createErrorResponse("VIDEO_URL_REQUIRED", "A YouTube URL is required"));
      if (!["private", "company"].includes(visibility)) return res.status(400).json(createErrorResponse("INVALID_VISIBILITY", "Video visibility must be private or company"));

      const video = await youtubeService.transcribe(url);
      const transcript = video.segments.map((segment) => `[${timestamp(segment.offset)}] ${segment.text.trim()}`).join("\n\n");
      const input = Buffer.from(transcript, "utf8");
      const result = await ingestDocument({
        buffer: input,
        filename: `${video.metadata.title}.transcript.txt`,
        mimeType: "text/plain",
        fileSize: input.byteLength,
        userId: req.user.id,
        visibility,
        sourceType: "youtube",
        sourceUrl: video.metadata.webpage_url || url,
        externalId: video.externalId,
        publishedAt: youtubeService.parseDate(video.metadata.upload_date),
        durationSeconds: video.metadata.duration,
        language: video.metadata.language || "pt",
      });

      if (result.outcome === "duplicate") return res.status(409).json(createErrorResponse("CONFLICT", "Este vídeo já foi importado."));
      return res.status(200).json(createSuccessResponse({
        ...result,
        title: video.metadata.title,
        videoUrl: video.metadata.webpage_url || url,
        transcriptSource: video.transcriptSource,
      }));
    } catch (error) {
      next(error);
    }
  },
};
