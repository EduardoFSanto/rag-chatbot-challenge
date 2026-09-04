import { Request, Response, NextFunction } from "express";
import { createErrorResponse, createSuccessResponse } from "../../lib/apiResponse.js";
import { adminRepository } from "./admin.repository.js";

export const adminController = {
  async listUsers(_req: Request, res: Response, next: NextFunction) {
    try {
      return res.status(200).json(createSuccessResponse(await adminRepository.listUsers()));
    } catch (error) {
      next(error);
    }
  },

  async updateRole(req: Request, res: Response, next: NextFunction) {
    try {
      const { role } = req.body as { role?: string };
      if (!role || !["user", "admin"].includes(role)) {
        return res.status(400).json(createErrorResponse("INVALID_ROLE", "Role must be user or admin"));
      }
      await adminRepository.updateRole(req.params.userId, role as "user" | "admin");
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
