// src/api/middleware/validateRequest.ts

import { Request, Response, NextFunction } from "express";
import { config } from "../lib/config.js";
import { createErrorResponse } from "../lib/apiResponse.js";

export const validateFileUpload = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.file) {
    return res.status(400).json(createErrorResponse("NO_FILE", "No file provided"));
  }

  const { allowedMimeTypes, maxFileSize } = config.upload;

  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    return res.status(400).json(createErrorResponse(
      "INVALID_MIME_TYPE",
      `Invalid file type: ${req.file.mimetype}. Allowed: ${allowedMimeTypes.join(", ")}`,
    ));
  }

  if (req.file.size > maxFileSize) {
    return res.status(400).json(createErrorResponse(
      "FILE_TOO_LARGE",
      `File exceeds ${maxFileSize / 1024 / 1024}MB limit`,
    ));
  }

  next();
};

export const validateQuestion = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json(createErrorResponse("EMPTY_QUESTION", "Question cannot be empty"));
  }

  if (typeof question !== "string") {
    return res.status(400).json(createErrorResponse("INVALID_QUESTION_TYPE", "Question must be a string"));
  }

  if (question.length > config.rag.maxQuestionLength) {
    return res.status(400).json(createErrorResponse(
      "QUESTION_TOO_LONG",
      `Question exceeds ${config.rag.maxQuestionLength} character limit`,
    ));
  }

  next();
};
