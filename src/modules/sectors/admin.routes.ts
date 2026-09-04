import express, { RequestHandler } from "express";
import { requireAdmin } from "../../middleware/authMiddleware.js";
import { adminController } from "./admin.controller.js";

const router = express.Router();

router.use(requireAdmin);
router.get("/users", adminController.listUsers as RequestHandler);
router.patch("/users/:userId", adminController.updateRole as RequestHandler);

export default router;
