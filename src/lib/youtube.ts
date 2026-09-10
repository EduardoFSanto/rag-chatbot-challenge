import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import youtubedl from "youtube-dl-exec";
import { fetchTranscript } from "youtube-transcript";
import Groq from "groq-sdk";
import ffmpegPath from "ffmpeg-static";
import { logger } from "./logger.js";

type YoutubeDl = (url: string, flags: Record<string, unknown>) => Promise<unknown>;
const runYoutubeDl = youtubedl as unknown as YoutubeDl;

export interface YoutubeMetadata {
  id: string;
  title: string;
  description?: string;
  webpage_url: string;
  thumbnail?: string;
  channel?: string;
  channel_id?: string;
  upload_date?: string;
  timestamp?: number;
  duration?: number;
  language?: string;
}

export interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function extractVideoId(value: string) {
  const url = new URL(value);
  if (url.hostname === "youtu.be" && url.pathname.slice(1)) return url.pathname.slice(1);
  if (url.hostname.endsWith("youtube.com")) {
    const id = url.searchParams.get("v") || url.pathname.match(/shorts\/([^/]+)/)?.[1] || url.pathname.match(/embed\/([^/]+)/)?.[1];
    if (id) return id;
  }
  throw new Error("URL do YouTube inválida");
}

function parseUploadDate(value?: string) {
  if (!value || value.length !== 8) return undefined;
  return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`);
}

async function officialTranscript(videoId: string): Promise<TranscriptSegment[]> {
  const transcript = await fetchTranscript(videoId, { lang: "pt" });
  return transcript.map((segment) => ({ text: segment.text, offset: segment.offset / 1000, duration: segment.duration / 1000 }));
}

async function whisperTranscript(url: string, language = "pt"): Promise<TranscriptSegment[]> {
  const directory = await mkdtemp(join(tmpdir(), "atlas-youtube-"));
  const audioPath = join(directory, "audio.mp3");
  try {
    await runYoutubeDl(url, { extractAudio: true, audioFormat: "mp3", output: audioPath, ffmpegLocation: ffmpegPath || undefined, noWarnings: true, noCheckCertificates: true });
    const response = await groq.audio.transcriptions.create({
      file: createReadStream(audioPath),
      model: "whisper-large-v3-turbo",
      language,
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });
    return [{ text: response.text, offset: 0, duration: 0 }];
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export const youtubeService = {
  async transcribe(url: string) {
    const externalId = extractVideoId(url);
    const metadata = await runYoutubeDl(url, { dumpSingleJson: true, skipDownload: true, noWarnings: true, noCheckCertificates: true }) as YoutubeMetadata;
    let segments: TranscriptSegment[];
    let transcriptSource: "captions" | "whisper" = "captions";
    try {
      segments = await officialTranscript(externalId);
    } catch (error) {
      logger.warn(`No official captions for ${externalId}; using Whisper fallback: ${error instanceof Error ? error.message : String(error)}`);
      segments = await whisperTranscript(url, metadata.language?.split("-")[0] || "pt");
      transcriptSource = "whisper";
    }
    const text = segments.map((segment) => segment.text.trim()).filter(Boolean).join("\n\n");
    if (!text) throw new Error("Não foi possível obter uma transcrição para este vídeo");
    return { externalId, metadata, segments, text, transcriptSource };
  },

  parseDate: parseUploadDate,
};
