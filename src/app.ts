import express, { Express, Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";
import { errorHandler } from "./api/middleware/errorHandler.js";
import uploadRouter from "./api/routes/upload.js";
import queryRouter from "./api/routes/query.js";
import conversationRouter from "./api/routes/conversation.js";
import documentRouter from "./api/routes/document.js"; // <--- NOVO IMPORT
import { logger } from "./utils/logger.js";
import { vectorStore } from "./storage/vectorStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createApp = (): Express => {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, "../public")));

  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  app.get("/", (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
  });

  app.get("/health", (req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      vector_store_chunks: vectorStore.count(),
    });
  });

  app.all("/api/auth/*", toNodeHandler(auth));

  app.use("/api/upload", uploadRouter);
  app.use("/api/ask", queryRouter);
  app.use("/api/conversations", conversationRouter);
  app.use("/api/documents", documentRouter); // <--- NOVA ROTA REGISTRADA

  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: "Not found",
      code: "NOT_FOUND",
      path: req.path,
    });
  });

  app.use(errorHandler);

  return app;
};