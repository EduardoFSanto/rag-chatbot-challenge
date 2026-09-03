import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("3000"),
  DATABASE_URL: z.string(),
  QDRANT_URL: z.string().default("http://localhost:6333"),
  COLLECTION_NAME: z.string().default("vrtech_knowledge"),
  BETTER_AUTH_SECRET: z.string(),
});

export const env = envSchema.parse(process.env);