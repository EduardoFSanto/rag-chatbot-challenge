import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { documentController } from "../controllers/documentController.js";

const router = Router();

// Apenas usuários autenticados podem deletar
router.use(requireAuth); 

router.delete("/:id", documentController.delete);

export default router;