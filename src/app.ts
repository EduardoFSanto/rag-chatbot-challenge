// src/app.ts

import express, { Express, Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { errorHandler } from "./api/middleware/errorHandler.js";
import uploadRouter from "./api/routes/upload.js";
import queryRouter from "./api/routes/query.js";
import { logger } from "./utils/logger.js";
import { vectorStore } from "./storage/vectorStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createApp = (): Express => {
  const app = express();

  // Built-in middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve static files (for home page)
  app.use(express.static(path.join(__dirname, "../public")));

  // Request logging middleware
  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  // Home page route
  app.get("/", (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
  });

  // Health check endpoint
  app.get("/health", (req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      vector_store_chunks: vectorStore.count(),
    });
  });

  // API routes
  app.use("/api", uploadRouter);
  app.use("/api", queryRouter);

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: "Not found",
      code: "NOT_FOUND",
      path: req.path,
    });
  });

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
};
