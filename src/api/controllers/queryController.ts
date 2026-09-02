import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversations } from "../../db/conversations.js";
import { messages } from "../../db/messages.js";
import { vectorStore } from "../../storage/vectorStore.js";
import { embeddingService } from "../../core/embeddings.js";
import { llmService } from "../../core/llm.js";
import { logger } from "../../utils/logger.js";
import { createSuccessResponse, createErrorResponse } from "../../utils/apiResponse.js";

export const queryController = {
  async handle(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json(createErrorResponse("UNAUTHORIZED", "Unauthorized"));
      }

      const { question, conversationId } = req.body;

      if (!question) {
        return res.status(400).json(createErrorResponse("BAD_REQUEST", "Question is required"));
      }

      let currentConversationId = conversationId;

      if (!currentConversationId) {
        const [newConversation] = await db
          .insert(conversations)
          .values({
            userId: user.id,
            title: question.substring(0, 50),
          })
          .returning();
        currentConversationId = newConversation.id;
      }

      await db.insert(messages).values({
        conversationId: currentConversationId,
        role: "user",
        content: question,
      });

      const queryEmbedding = await embeddingService.generate(question);
      const searchResults = await vectorStore.search(queryEmbedding, 3, 0.3);

      const context = searchResults.map((r) => r.chunk.text).join("\n\n");

      const prompt = `Contexto: ${context}\n\nPergunta: ${question}\n\nResposta:`;
      const aiResponseText = await llmService.generate(prompt);

      await db.insert(messages).values({
        conversationId: currentConversationId,
        role: "assistant",
        content: aiResponseText,
        metadata: {
          sources: searchResults.map((r) => ({
            file: r.chunk.source_file,
            score: r.similarity_score,
          })),
        },
      });

      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, currentConversationId));

      return res.status(200).json(
        createSuccessResponse({
          conversationId: currentConversationId,
          answer: aiResponseText,
          sources: searchResults,
        })
      );
    } catch (error) {
      logger.error(`Query failed: ${error}`);
      next(error);
    }
  },
};