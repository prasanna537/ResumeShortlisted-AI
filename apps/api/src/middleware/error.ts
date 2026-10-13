import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import multer from "multer";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Invalid input: " + err.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "),
      code: "VALIDATION",
    });
  }
  if (err instanceof multer.MulterError) {
    return res
      .status(400)
      .json({ error: err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 5 MB)." : err.message, code: "UPLOAD" });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return res.status(409).json({ error: "Already exists.", code: "CONFLICT" });
    if (err.code === "P2025") return res.status(404).json({ error: "Not found.", code: "NOT_FOUND" });
  }
  logger.error("unhandled", { message: (err as Error)?.message });
  res.status(500).json({ error: "Something went wrong. Please try again.", code: "INTERNAL" });
}
