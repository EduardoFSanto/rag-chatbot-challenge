import { Request, Response, NextFunction } from "express";
import { createSuccessResponse, createErrorResponse } from "../../lib/apiResponse.js";
import { queryService } from "./query.service.js";

export const queryController = {
  async ask(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json(createErrorResponse("UNAUTHORIZED", "Unauthorized"));
      }

      const { question, conversationId } = req.body;
      if (!question) {
        return res.status(400).json(createErrorResponse("BAD_REQUEST", "Question is required"));
      }

      const result = await queryService.processQuery({
        question,
        conversationId,
        userId: user.id,
      });

      if (result.outcome === "no_context") {
        return res.status(200).json(
          createSuccessResponse({
            conversationId: result.conversationId,
            answer: "Não encontrei informações suficientes na base de conhecimento para responder sua pergunta.",
            sources: [],
            confidence: 0,
          })
        );
      }

      return res.status(200).json(
        createSuccessResponse({
          conversationId: result.conversationId,
          answer: result.answer,
          sources: result.sources,
          confidence: result.confidence,
        })
      );
    } catch (error) {
      next(error);
    }
  },
};