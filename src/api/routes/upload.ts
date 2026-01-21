// src/api/routes/upload.ts

import express from "express";
import multer from "multer";
import { validateFileUpload } from "../middleware/validateRequest.js";
import { uploadController } from "../controllers/uploadController.js";

const router = express.Router();

// Configurar multer para armazenar arquivo em memória
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

router.post(
  "/upload",
  upload.single("file"),
  validateFileUpload,
  uploadController.handle,
);

export default router;
