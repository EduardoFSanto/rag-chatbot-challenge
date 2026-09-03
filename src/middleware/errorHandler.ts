// src/api/middleware/errorHandler.ts

import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";
import { AppError } from "../types/index.js";

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  logger.error("Request error", err);

  const appErr = err as AppError;

  // Specific error codes
  if (appErr.code === "INSUFFICIENT_CONTEXT") {
    return res.status(200).json({
      success: true,
      answer: null,
      status: "insufficient_context",
      message: appErr.message || "No sufficiently relevant chunks found.",
      sources: [],
      retrieval_stats: {
        chunks_retrieved: 0,
        threshold_used: 0.7,
        total_chunks_in_store: 0,
      },
    });
  }

  if (appErr.code === "API_RATE_LIMITED") {
    return res.status(429).json({
      error: "API rate limited. Please retry in 30 seconds.",
      code: "RATE_LIMITED",
      retry_after: 30,
    });
  }

  if (appErr.code === "INVALID_API_KEY") {
    return res.status(500).json({
      error: "External service unavailable (invalid credentials)",
      code: "SERVICE_UNAVAILABLE",
    });
  }

  if (appErr.code === "EMBEDDING_ERROR" || appErr.code === "LLM_ERROR") {
    return res.status(appErr.statusCode || 500).json({
      error: appErr.message || "External service error",
      code: appErr.code,
    });
  }

  // Generic error
  const statusCode = appErr.statusCode || 500;
  return res.status(statusCode).json({
    error: appErr.message || "Internal server error",
    code: appErr.code || "INTERNAL_ERROR",
  });
};
