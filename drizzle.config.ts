import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./src/db/schema.ts", "./src/db/documents.ts", "./src/db/conversations.ts", "./src/db/messages.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});