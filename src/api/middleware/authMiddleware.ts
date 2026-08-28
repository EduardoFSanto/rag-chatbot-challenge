import { Request, Response, NextFunction } from "express";
import { auth } from "../../auth.js";

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    (req as any).user = session.user;
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user || user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  next();
};