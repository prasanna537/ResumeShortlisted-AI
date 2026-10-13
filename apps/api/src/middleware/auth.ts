import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { loadEnv } from "../config/env";
import { AppError, unauthorized } from "../utils/errors";

export const COOKIE = "rv_token";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, loadEnv().JWT_SECRET, { expiresIn: "7d" });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next(unauthorized());
  try {
    const p = jwt.verify(token, loadEnv().JWT_SECRET) as { sub: string };
    req.userId = p.sub;
    next();
  } catch {
    next(unauthorized("Session expired"));
  }
}

/** CSRF defence for cookie auth: state-changing requests need a custom header that cross-site forms cannot set. */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("x-requested-with") !== "ResumeVerify") {
    return next(new AppError(403, "Missing CSRF header", "CSRF"));
  }
  next();
}
