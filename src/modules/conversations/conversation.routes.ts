import { Router, RequestHandler } from "express";
import { requireWorkspaceMember } from "../../middleware/authMiddleware.js";
import { conversationController } from "./conversation.controller.js"; // Caminho corrigido

const router = Router();

router.use(requireWorkspaceMember);
router.get("/", conversationController.list as RequestHandler);
router.get("/:id", conversationController.getById as RequestHandler);

export default router;