import { z } from "zod";

export const queryRequestSchema = z.object({
  question: z.string().min(1).max(5000),
  conversationId: z.string().uuid().optional(),
});

export const queryResponseSchema = z.object({
  conversationId: z.string().uuid(),
  answer: z.string(),
  sources: z.array(
    z.object({
      file: z.string(),
      score: z.number(),
    })
  ),
  confidence: z.number(),
});