// src/api/routes/query.ts

import express from "express";
import { validateQuestion } from "../middleware/validateRequest.js";
import { queryController } from "../controllers/queryController.js";

const router = express.Router();

router.post("/ask", validateQuestion, queryController.handle);

export default router;
