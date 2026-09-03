import { pgTable, text, timestamp, integer, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

export type DocumentStatus = "processing" | "processed" | "failed";

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  filename: text("filename").notNull(),
  fileHash: text("file_hash").notNull().unique(),
  fileSize: integer("file_size").notNull(),
  userId: text("user_id").notNull().references(() => user.id),
  qdrantCollection: text("qdrant_collection").notNull(),
  status: text("status").$type<DocumentStatus>().default("processing").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});