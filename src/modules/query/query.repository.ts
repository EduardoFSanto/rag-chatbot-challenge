import { eq, and, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversations } from "../../db/schema/conversations.js";
import { messages } from "../../db/schema/messages.js";

export const queryRepository = {
  async findConversationById(conversationId: string, userId: string) {
    return db.query.conversations.findFirst({
      where: and(eq(conversations.id, conversationId), eq(conversations.userId, userId)),
    });
  },

  async findMessagesByConversationId(conversationId: string) {
    return db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: [messages.createdAt],
    });
  },

  async createConversation(userId: string, title: string) {
    const [conversation] = await db
      .insert(conversations)
      .values({ userId, title })
      .returning();
    return conversation;
  },

  async updateConversationTimestamp(conversationId: string) {
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  },

  async saveMessage(conversationId: string, role: "user" | "assistant", content: string, metadata?: any) {
    const [message] = await db
      .insert(messages)
      .values({ conversationId, role, content, metadata })
      .returning();
    return message;
  },
};