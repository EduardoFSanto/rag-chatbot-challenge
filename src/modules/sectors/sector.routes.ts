import express, { RequestHandler } from "express";
import { requireAuth, requireAdmin } from "../../middleware/authMiddleware.js";
import { sectorController } from "./sector.controller.js";

const router = express.Router();

router.get("/", requireAuth, sectorController.list as RequestHandler);
router.post("/:sectorId/members", requireAdmin, sectorController.addMember as RequestHandler);
router.delete("/:sectorId/members", requireAdmin, sectorController.removeMember as RequestHandler);

export default router;
