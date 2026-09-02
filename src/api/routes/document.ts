import { Router, RequestHandler } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { documentController } from "../controllers/documentController.js";

const router = Router();

router.use(requireAuth);

router.delete("/:id", documentController.delete as RequestHandler);

export default router;