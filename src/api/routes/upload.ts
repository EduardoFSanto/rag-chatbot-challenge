import express from "express";
import multer from "multer";
import { validateFileUpload } from "../middleware/validateRequest.js";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";
import { uploadController } from "../controllers/uploadController.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

router.post(
  "/",
  requireAuth,
  requireAdmin,
  upload.single("file"),
  validateFileUpload,
  uploadController.handle,
);

export default router;