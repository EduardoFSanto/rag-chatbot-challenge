import express, { RequestHandler } from "express";
import multer from "multer";
import { requireAuth, requireAdmin } from "../../middleware/authMiddleware.js";
import { documentController } from "./document.controller.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// Upload de arquivo
router.post(
  "/upload",
  requireAuth,
  requireAdmin,
  upload.single("file"),
  documentController.upload as RequestHandler,
);

// Deletar documento
router.delete(
  "/:id",
  requireAuth,
  documentController.delete as RequestHandler,
);

export default router;