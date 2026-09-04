import { Request, Response, NextFunction } from "express";
import { createSuccessResponse, createErrorResponse } from "../../lib/apiResponse.js";
import { documentService } from "./document.service.js";
import type { DocumentVisibility } from "../../db/schema/documents.js";
import { sectorRepository } from "../sectors/sector.repository.js";

export const documentController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json(createErrorResponse("UNAUTHORIZED", "Unauthorized"));
      }

      const data = await documentService.listByUser(user.id);
      return res.status(200).json(createSuccessResponse(data));
    } catch (error) {
      next(error);
    }
  },

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

      const visibility = req.body.visibility as DocumentVisibility | undefined;
      let sectorIds: string[] = [];
      if (req.body.sectorIds) {
        try {
          const parsed = JSON.parse(req.body.sectorIds);
          if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
            throw new Error("invalid sector ids");
          }
          sectorIds = parsed;
        } catch {
          return res.status(400).json(createErrorResponse("INVALID_SECTORS", "Invalid sector selection"));
        }
      }

      if (visibility && !["private", "sector", "company"].includes(visibility)) {
        return res.status(400).json(createErrorResponse("INVALID_VISIBILITY", "Invalid document visibility"));
      }
      if (visibility === "sector" && sectorIds.length === 0) {
        return res.status(400).json(createErrorResponse("SECTOR_REQUIRED", "Select at least one sector"));
      }
      if (visibility !== "sector" && sectorIds.length > 0) {
        return res.status(400).json(createErrorResponse("INVALID_SECTORS", "Sectors require sector visibility"));
      }
      if (sectorIds.length > 0 && (await sectorRepository.findByIds(sectorIds)).length !== sectorIds.length) {
        return res.status(400).json(createErrorResponse("INVALID_SECTORS", "One or more selected sectors do not exist"));
      }

      const result = await documentService.ingest({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        userId: user.id,
        visibility,
        sectorIds,
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