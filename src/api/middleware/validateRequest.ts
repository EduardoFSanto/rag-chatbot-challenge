// src/api/middleware/validateRequest.ts

import { Request, Response, NextFunction } from "express";
import { config } from "../../utils/config.js";

export const validateFileUpload = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.file) {
    return res.status(400).json({
      error: "No file provided",
      code: "NO_FILE",
    });
  }

  const { allowedMimeTypes, maxFileSize } = config.upload;

  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    return res.status(400).json({
      error: `Invalid file type: ${req.file.mimetype}. Allowed: ${allowedMimeTypes.join(", ")}`,
      code: "INVALID_MIME_TYPE",
    });
  }

  if (req.file.size > maxFileSize) {
    return res.status(400).json({
      error: `File exceeds ${maxFileSize / 1024 / 1024}MB limit`,
      code: "FILE_TOO_LARGE",
    });
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
    return res.status(400).json({
      error: "Question cannot be empty",
      code: "EMPTY_QUESTION",
    });
  }

  if (typeof question !== "string") {
    return res.status(400).json({
      error: "Question must be a string",
      code: "INVALID_QUESTION_TYPE",
    });
  }

  if (question.length > config.rag.maxQuestionLength) {
    return res.status(400).json({
      error: `Question exceeds ${config.rag.maxQuestionLength} character limit`,
      code: "QUESTION_TOO_LONG",
    });
  }

  next();
};
