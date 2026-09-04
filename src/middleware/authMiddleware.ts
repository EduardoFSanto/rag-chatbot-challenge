import { Request, Response, NextFunction } from "express";
import { auth } from "../auth.js";
import { createErrorResponse } from "../lib/apiResponse.js";
import { db } from "../db/index.js";
import { userSectors } from "../db/schema/sectors.js";
import { eq } from "drizzle-orm";

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session || !session.user) {
      return res.status(401).json(createErrorResponse("UNAUTHORIZED", "Unauthorized"));
    }

    req.user = {
      id: session.user.id,
      email: session.user.email,
      role: (session.user as { role?: string }).role ?? "user",
      name: session.user.name,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  await requireAuth(req, res, () => {
    if (req.user?.role !== "admin") {
      return res.status(403).json(createErrorResponse("FORBIDDEN", "Admin access required"));
    }
    next();
  });
};

export const requireWorkspaceMember = async (req: Request, res: Response, next: NextFunction) => {
  await requireAuth(req, res, async () => {
    if (req.user?.role === "admin") return next();

    const membership = await db.query.userSectors.findFirst({
      where: eq(userSectors.userId, req.user!.id),
      columns: { userId: true },
    });

    if (!membership) {
      return res.status(403).json(createErrorResponse("WORKSPACE_ACCESS_REQUIRED", "Your account is not assigned to a workspace sector"));
    }

    next();
  });
};