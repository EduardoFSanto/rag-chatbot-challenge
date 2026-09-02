import { Request, Response, NextFunction } from "express";
import { auth } from "../../auth.js";
import { createErrorResponse } from "../../utils/apiResponse.js";

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