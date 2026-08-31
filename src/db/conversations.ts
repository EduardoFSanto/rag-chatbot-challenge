import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./schema.js";

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id),
  title: text("title"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});