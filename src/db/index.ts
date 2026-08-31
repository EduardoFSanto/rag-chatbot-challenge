import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import * as documents from "./documents.js";
import * as conversations from "./conversations.js";
import * as messages from "./messages.js";

const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client, { schema: { ...schema, ...documents, ...conversations, ...messages } });