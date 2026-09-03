import { Request, Response, NextFunction } from "express";
import { createSuccessResponse, createErrorResponse } from "../../lib/apiResponse.js";
import { conversationService } from "./conversation.service.js";

export const conversationController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json(createErrorResponse("UNAUTHORIZED", "Unauthorized"));

      const data = await conversationService.listByUser(user.id);
      return res.status(200).json(createSuccessResponse(data));
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json(createErrorResponse("UNAUTHORIZED", "Unauthorized"));

      const { id } = req.params;
      const data = await conversationService.getById(id, user.id);

      if (!data) {
        return res.status(404).json(createErrorResponse("NOT_FOUND", "Conversation not found or access denied"));
      }

      return res.status(200).json(createSuccessResponse(data));
    } catch (error) {
      next(error);
    }
  },
};