import express, { Express, Request, Response } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { logger } from "./lib/logger.js";

// Importando os NOVOS módulos refatorados
import documentRouter from "./modules/documents/document.routes.js";
import conversationRouter from "./modules/conversations/conversation.routes.js";
import queryRouter from "./modules/query/query.routes.js";
import { vectorStore } from "./lib/storage/vectorStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createApp = (): Express => {
  const app = express();

  app.use(cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Arquivos estáticos (se ainda estiver usando o index.html de teste)
  app.use(express.static(path.join(__dirname, "../public")));
  app.get("/", (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
  });

  app.get("/health", async (_req: Request, res: Response) => {
    try {
      const chunks = await vectorStore.count();
      return res.status(200).json({
        status: "ok",
        service: "rag-api",
        chunks,
        timestamp: new Date().toISOString(),
      });
    } catch {
      return res.status(503).json({
        status: "degraded",
        service: "rag-api",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Better Auth
  app.all("/api/auth/*", toNodeHandler(auth));

  // Registrando os Módulos Refatorados
  app.use("/api/documents", documentRouter);         // Cuida de /api/documents/upload e /api/documents/:id
  app.use("/api/conversations", conversationRouter); // Cuida de /api/conversations
  app.use("/api/ask", queryRouter);                  // Cuida de /api/ask

  // 404 handler
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