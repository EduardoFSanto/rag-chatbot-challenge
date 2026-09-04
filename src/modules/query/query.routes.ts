import express, { RequestHandler } from "express";
import { requireWorkspaceMember } from "../../middleware/authMiddleware.js";
import { validateQuestion } from "../../middleware/validateRequest.js";
import { queryController } from "./query.controller.js";

const router = express.Router();

router.post("/", requireWorkspaceMember, validateQuestion, queryController.ask as RequestHandler);

export default router;