import { eq, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversations } from "../../db/schema/conversations.js";

export const conversationRepository = {
  async findByUserId(userId: string) {
    return db.query.conversations.findMany({
      where: eq(conversations.userId, userId),
      orderBy: [desc(conversations.updatedAt)],
      columns: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  async findById(id: string) {
    return db.query.conversations.findFirst({
      where: eq(conversations.id, id),
    });
  },
};