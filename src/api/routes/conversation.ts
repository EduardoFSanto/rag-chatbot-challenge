import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { conversationController } from "../controllers/conversationController.js";

const router = Router();

router.use(requireAuth);

router.get("/", conversationController.list);
router.get("/:id", conversationController.getById);

export default router;