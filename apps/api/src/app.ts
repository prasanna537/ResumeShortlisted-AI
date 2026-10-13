import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { loadEnv } from "./config/env";
import { api } from "./routes";
import { errorHandler } from "./middleware/error";
import { csrfGuard } from "./middleware/auth";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: loadEnv().WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.get("/health", (_req, res) => res.json({ ok: true }));
  // Limiters answer with JSON so the UI can show a real message.
  const limited = (windowMs: number, limit: number, extra: object = {}) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => res.status(429).json({ error: "Too many requests. Please wait a moment and try again.", code: "RATE_LIMIT" }),
      ...extra,
    });
  app.use("/api", limited(60_000, 1000));
  // Brute-force protection applies to credential endpoints only (not /auth/me, which every page load calls),
  // and successful logins do not count against the limit.
  app.use(["/api/auth/login", "/api/auth/register"], limited(15 * 60_000, 30, { skipSuccessfulRequests: true }));
  app.use("/api", csrfGuard, api);
  app.use((_req, res) => res.status(404).json({ error: "Not found", code: "NOT_FOUND" }));
  app.use(errorHandler);
  return app;
}
