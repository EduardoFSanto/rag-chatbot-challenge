import { pgTable, text, timestamp, integer, uuid } from "drizzle-orm/pg-core";
import { user } from "./schema.js";

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  filename: text("filename").notNull(),
  fileHash: text("file_hash").notNull(), // <--- NOVO: Hash SHA-256 para idempotência
  fileSize: integer("file_size").notNull(),
  userId: text("user_id").notNull().references(() => user.id),
  qdrantCollection: text("qdrant_collection").notNull(),
  status: text("status").default("processed").notNull(), // <--- NOVO: Lifecycle do documento
  createdAt: timestamp("created_at").defaultNow().notNull(),
});