import { Request, Response, NextFunction } from "express";
import { createSuccessResponse, createErrorResponse } from "../../lib/apiResponse.js";
import { sectorRepository } from "./sector.repository.js";

export const sectorController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json(createErrorResponse("UNAUTHORIZED", "Unauthorized"));

      const [sectors, memberships] = await Promise.all([
        sectorRepository.findAll(),
        sectorRepository.findForUser(req.user.id),
      ]);

      return res.status(200).json(createSuccessResponse({ sectors, memberships }));
    } catch (error) {
      next(error);
    }
  },

  async addMember(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, role = "member" } = req.body as { userId?: string; role?: string };
      const { sectorId } = req.params;
      if (!userId || !["member", "editor", "admin"].includes(role)) {
        return res.status(400).json(createErrorResponse("INVALID_MEMBERSHIP", "User and membership role are required"));
      }
      if ((await sectorRepository.findByIds([sectorId])).length !== 1) {
        return res.status(404).json(createErrorResponse("SECTOR_NOT_FOUND", "Sector not found"));
      }
      await sectorRepository.addMember(userId, sectorId, role as "member" | "editor" | "admin");
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async removeMember(req: Request, res: Response, next: NextFunction) {
    try {
      await sectorRepository.removeMember(req.body.userId, req.params.sectorId);
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
