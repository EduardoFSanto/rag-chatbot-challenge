import {
  customType,
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { documents } from "./documents.js";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, {
        onDelete: "cascade",
      }),

    text: text("text").notNull(),

    chunkIndex: integer("chunk_index").notNull(),

    charStart: integer("char_start").notNull(),

    charEnd: integer("char_end").notNull(),

    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('portuguese', "text")`,
    ),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("document_chunks_document_id_idx").on(
      table.documentId,
    ),

    uniqueIndex("document_chunks_document_chunk_index_unique").on(
      table.documentId,
      table.chunkIndex,
    ),

    index("document_chunks_search_vector_idx").using(
      "gin",
      table.searchVector,
    ),
  ],
);