import { pgTable, text, timestamp, integer, uuid } from "drizzle-orm/pg-core";
import { user } from "./schema.js";

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  filename: text("filename").notNull(),
  fileSize: integer("file_size").notNull(),
  userId: text("user_id").notNull().references(() => user.id),
  qdrantCollection: text("qdrant_collection").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});