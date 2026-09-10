import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth.js";

export type DocumentStatus = "processing" | "processed" | "failed";
export type DocumentVisibility = "private" | "sector" | "company";
export type DocumentSourceType = "file" | "youtube";

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    filename: text("filename").notNull(),

    sourceType: text("source_type")
      .$type<DocumentSourceType>()
      .default("file")
      .notNull(),

    sourceUrl: text("source_url"),
    externalId: text("external_id"),
    publishedAt: timestamp("published_at"),
    durationSeconds: integer("duration_seconds"),
    language: text("language"),

    fileHash: text("file_hash").notNull().unique(),
    fileSize: integer("file_size").notNull(),

    userId: text("user_id")
      .notNull()
      .references(() => user.id),

    qdrantCollection: text("qdrant_collection").notNull(),

    status: text("status")
      .$type<DocumentStatus>()
      .default("processing")
      .notNull(),

    visibility: text("visibility")
      .$type<DocumentVisibility>()
      .default("private")
      .notNull(),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("documents_youtube_external_id_unique")
      .on(table.sourceType, table.externalId)
      .where(
        sql`${table.sourceType} = 'youtube' AND ${table.externalId} IS NOT NULL`,
      ),
  ],
);