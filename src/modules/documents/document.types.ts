export type { DocumentStatus } from "../../db/schema/documents.js";

export interface DocumentUploadResponse {
  documentId: string;
  filename: string;
  numChunks: number;
  totalChars: number;
}

export interface DocumentDeleteResponse {
  message: string;
}