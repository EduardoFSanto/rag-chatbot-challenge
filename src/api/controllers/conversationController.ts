import { Request, Response, NextFunction } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversations } from "../../db/conversations.js";
import { messages } from "../../db/messages.js";
import { createSuccessResponse, createErrorResponse } from "../../utils/apiResponse.js";

export const conversationController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json(createErrorResponse("UNAUTHORIZED", "Unauthorized"));
      }

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

      return res.status(200).json(createSuccessResponse(userConversations));
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json(createErrorResponse("UNAUTHORIZED", "Unauthorized"));
      }

      const { id } = req.params;

      const conversation = await db.query.conversations.findFirst({
        where: and(eq(conversations.id, id), eq(conversations.userId, user.id)),
      });

      if (!conversation) {
        return res.status(404).json(
          createErrorResponse("NOT_FOUND", "Conversation not found or access denied")
        );
      }

      const chatMessages = await db.query.messages.findMany({
        where: eq(messages.conversationId, id),
        orderBy: [messages.createdAt],
      });

      return res.status(200).json(
        createSuccessResponse({
          conversation,
          messages: chatMessages,
        })
      );
    } catch (error) {
      next(error);
    }
  },
};