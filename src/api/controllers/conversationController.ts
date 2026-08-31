import { Request, Response, NextFunction } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversations } from "../../db/conversations.js";
import { messages } from "../../db/messages.js";

export const conversationController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;

      const userConversations = await db.query.conversations.findMany({
        where: eq(conversations.userId, user.id),
        orderBy: [desc(conversations.updatedAt)],
        columns: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return res.status(200).json({
        success: true,
        data: userConversations,
      });
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const { id } = req.params;

      const conversation = await db.query.conversations.findFirst({
        where: and(eq(conversations.id, id), eq(conversations.userId, user.id)),
      });

      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: "Conversation not found",
        });
      }

      const chatMessages = await db.query.messages.findMany({
        where: eq(messages.conversationId, id),
        orderBy: [messages.createdAt],
      });

      return res.status(200).json({
        success: true,
        data: {
          conversation,
          messages: chatMessages,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};