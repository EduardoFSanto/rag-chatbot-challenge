import { Request, Response, NextFunction } from "express";
import { createSuccessResponse, createErrorResponse } from "../../lib/apiResponse.js";
import { documentService } from "./document.service.js";

export const documentController = {
  async upload(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json(createErrorResponse("UNAUTHORIZED", "Unauthorized"));
      }

      if (!req.file) {
        return res.status(400).json(
          createErrorResponse("BAD_REQUEST", "No file provided. Please upload a PDF or TXT file.")
        );
      }

      const result = await documentService.ingest({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        userId: user.id,
      });

      if (result.outcome === "duplicate") {
        return res.status(409).json(
          createErrorResponse("CONFLICT", `File "${req.file.originalname}" has already been processed.`)
        );
      }

      return res.status(200).json(
        createSuccessResponse({
          documentId: result.documentId,
          filename: req.file.originalname,
          numChunks: result.numChunks,
          totalChars: result.totalChars,
        })
      );
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json(createErrorResponse("UNAUTHORIZED", "Unauthorized"));
      }

      const { id } = req.params;

      await documentService.delete(id, user.id);

      return res.status(200).json(
        createSuccessResponse({ message: "Document and associated vectors deleted successfully" })
      );
    } catch (error) {
      next(error);
    }
  },
};