import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler as h } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth";
import * as auth from "../controllers/authController";
import * as jobs from "../controllers/jobController";
import * as c from "../controllers/candidateController";

export const api = Router();

api.post("/auth/register", h(auth.register));
api.post("/auth/login", h(auth.login));
api.post("/auth/logout", h(auth.logout));
api.get("/auth/me", requireAuth, h(auth.me));

// Everything below requires a logged-in recruiter.
api.use(requireAuth);

api.get("/dashboard", h(c.dashboard));

api.post("/jobs", h(jobs.create));
api.get("/jobs", h(jobs.list));
api.get("/jobs/:id", h(jobs.get));
api.put("/jobs/:id", h(jobs.update));
api.delete("/jobs/:id", h(jobs.remove));

api.post("/candidates", h(c.create));
api.get("/candidates", h(c.list));
api.post("/candidates/compare", h(c.compare));
api.get("/candidates/:id", h(c.get));
api.delete("/candidates/:id", h(c.remove));
api.put("/candidates/:id/notes", h(c.notes));

api.post("/candidates/:id/resume", c.upload.single("file"), h(c.uploadResume));
api.get("/candidates/:id/resume", h(c.getResume));

// AI-backed endpoints are the expensive ones: tighter limit.
const aiLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: "Too many analysis requests. Please wait a minute.", code: "RATE_LIMIT" }),
});
api.post("/candidates/:id/analyze", aiLimit, h(c.analyze));
api.get("/candidates/:id/analysis", h(c.analysis));

api.get("/candidates/:id/claims", h(c.claims));
api.get("/candidates/:id/evidence", h(c.evidence));
api.get("/candidates/:id/verification", h(c.verification));
api.get("/candidates/:id/jd-match", h(c.jdMatch));
api.get("/candidates/:id/score", h(c.score));
api.get("/candidates/:id/report", h(c.report));

api.post("/candidates/:id/github", aiLimit, h(c.github));
api.get("/candidates/:id/github", h(c.getGithub));
api.post("/candidates/:id/linkedin", h(c.linkedin));
api.post("/candidates/:id/leetcode", h(c.leetcode));

api.get("/shortlist", h(c.shortlistList));
api.post("/candidates/:id/shortlist", h(c.shortlist));
api.delete("/candidates/:id/shortlist", h(c.unshortlist));
