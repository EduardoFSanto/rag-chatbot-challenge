import express from "express";
import { validateQuestion } from "../middleware/validateRequest.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { queryController } from "../controllers/queryController.js";

const router = express.Router();

router.post("/", requireAuth, validateQuestion, queryController.handle);

export default router;