import { z } from "zod";

export const uploadResponseSchema = z.object({
  documentId: z.string().uuid(),
  filename: z.string(),
  numChunks: z.number().int().positive(),
  totalChars: z.number().int().positive(),
});

export const deleteResponseSchema = z.object({
  message: z.string(),
});