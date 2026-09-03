import express, { RequestHandler } from "express";
import { requireAuth } from "../../middleware/authMiddleware.js";
import { queryController } from "./query.controller.js";

const router = express.Router();

router.post("/", requireAuth, queryController.ask as RequestHandler);

export default router;