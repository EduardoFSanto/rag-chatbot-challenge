// src/types/index.ts

export interface Chunk {
  id: string;
  text: string;
  source_file: string;
  chunk_index: number;
  char_start: number;
  char_end: number;
}

export interface StoredChunk extends Chunk {
  embedding: number[];
}

export interface SearchResult {
  chunk: StoredChunk;
  similarity_score: number;
}

export interface UploadResponse {
  success: boolean;
  file_id: string;
  filename: string;
  num_chunks: number;
  total_chars: number;
  message: string;
}

export interface SourceCitation {
  filename: string;
  chunk_index: number;
  similarity_score: number;
  snippet: string;
}

export interface RetrievalStats {
  chunks_retrieved: number;
  threshold_used: number;
  total_chunks_in_store: number;
}

export interface QueryResponse {
  success: boolean;
  answer: string | null;
  status?: "success" | "insufficient_context" | "no_documents";
  message?: string;
  sources: SourceCitation[];
  retrieval_stats: RetrievalStats;
}

export interface AppError extends Error {
  code: string;
  statusCode: number;
}
