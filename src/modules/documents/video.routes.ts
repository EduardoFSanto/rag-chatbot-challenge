import express, { RequestHandler } from "express";
import { requireAdmin } from "../../middleware/authMiddleware.js";
import { videoController } from "./video.controller.js";

const router = express.Router();

router.post("/import", requireAdmin, videoController.import as RequestHandler);

export default router;