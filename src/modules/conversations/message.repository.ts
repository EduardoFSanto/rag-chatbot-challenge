import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { messages } from "../../db/schema/messages.js";

export const messageRepository = {
  async findByConversationId(conversationId: string) {
    return db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: [messages.createdAt],
    });
  },
};