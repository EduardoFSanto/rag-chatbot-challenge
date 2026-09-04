import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { documents } from "./documents.js";

export type SectorMembershipRole = "member" | "editor" | "admin";

export const sectors = pgTable("sectors", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userSectors = pgTable(
  "user_sectors",
  {
    userId: text("user_id").notNull().references(() => user.id),
    sectorId: uuid("sector_id").notNull().references(() => sectors.id),
    role: text("role").$type<SectorMembershipRole>().default("member").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.sectorId] })],
);

export const documentSectors = pgTable(
  "document_sectors",
  {
    documentId: uuid("document_id").notNull().references(() => documents.id),
    sectorId: uuid("sector_id").notNull().references(() => sectors.id),
  },
  (table) => [primaryKey({ columns: [table.documentId, table.sectorId] })],
);