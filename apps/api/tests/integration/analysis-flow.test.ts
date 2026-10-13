import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import crypto from "crypto";
import type { ZodTypeAny } from "zod";

// ---- fakes for the network boundaries (Gemini + GitHub); DB/pgvector/Express are real -------------------
const state = vi.hoisted(() => ({ key: "strong" }));

// fakeAi is imported lazily at call time: importing it inside the factory would create a cycle with the mocked module.
vi.mock("../../src/ai/gemini", async (orig) => {
  const actual = await orig<typeof import("../../src/ai/gemini")>();
  return {
    ...actual,
    generateStructured: async (schema: ZodTypeAny, prompt: string) => (await import("./fakeAi")).fakeStructured(schema, prompt, state.key),
    geminiEmbeddings: { embed: async (texts: string[]) => (await import("./fakeAi")).fakeEmbedAll(texts) },
  };
});
vi.mock("../../src/integrations/github/collector", () => ({
  collectGithub: async (url: string) => (await import("./fakeAi")).fakeCollect(url),
}));

import { createApp } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { candidates, sampleJd } from "../fixtures/candidates";
import { makePdf, resumeText } from "../fixtures/pdf";

const app = createApp();
const H = { "X-Requested-With": "ResumeVerify" };
const run = crypto.randomUUID().slice(0, 8);
const emails: string[] = [];

async function login(tag: string) {
  const agent = request.agent(app);
  const email = `it-${run}-${tag}@example.test`;
  emails.push(email);
  const r = await agent.post("/api/auth/register").set(H).send({ email, password: "password123", name: tag });
  expect(r.status).toBe(201);
  return agent;
}

async function waitDone(agent: ReturnType<typeof request.agent>, id: string) {
  for (let i = 0; i < 120; i++) {
    const r = await agent.get(`/api/candidates/${id}/analysis`);
    const s = r.body.analysis?.status;
    if (s === "COMPLETED" || s === "FAILED") return r.body.analysis;
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error("analysis timed out");
}

let agent: ReturnType<typeof request.agent>;
let jobId: string;

beforeAll(async () => {
  agent = await login("owner");
  const r = await agent.post("/api/jobs").set(H).send({ title: sampleJd.title, company: sampleJd.company, description: sampleJd.description });
  expect(r.status).toBe(201);
  expect(r.body.warning).toBeUndefined();
  jobId = r.body.job.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("job → requirements → pgvector", () => {
  it("stores structured requirements, canonical skills and embeddings", async () => {
    const r = await agent.get(`/api/jobs/${jobId}`);
    const req = r.body.job.requirements as { kind: string; canonicalSkill: string }[];
    expect(req.filter((x) => x.kind === "REQUIRED").map((x) => x.canonicalSkill)).toEqual(expect.arrayContaining(["react", "nodejs", "mongodb", "restapi"]));
    expect(r.body.job.experienceYears).toBe(2);
    const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) n FROM "JobRequirement" WHERE "jobId" = ${jobId} AND "embedding" IS NOT NULL`;
    expect(Number(n)).toBe(5);
  });
});

describe("security and validation", () => {
  it("requires authentication", async () => {
    expect((await request(app).get("/api/jobs")).status).toBe(401);
  });
  it("requires the CSRF header on state-changing requests", async () => {
    expect((await agent.post("/api/jobs").send({ title: "x", description: "y".repeat(30) })).status).toBe(403);
  });
  it("validates input", async () => {
    expect((await agent.post("/api/jobs").set(H).send({ title: "", description: "short" })).status).toBe(400);
    expect((await request(app).post("/api/auth/register").set(H).send({ email: "bad", password: "x", name: "" })).status).toBe(400);
  });
  it("never exposes password hashes", async () => {
    const r = await agent.get("/api/auth/me");
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });
  it("rejects non-PDF uploads and analysis without a resume", async () => {
    const c = await agent.post("/api/candidates").set(H).send({ jobId, consentGiven: true });
    const id = c.body.candidate.id;
    const bad = await agent.post(`/api/candidates/${id}/resume`).set(H).attach("file", Buffer.from("hello world"), "cv.pdf");
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/PDF/);
    expect((await agent.post(`/api/candidates/${id}/analyze`).set(H)).status).toBe(400);
  });
  it("isolates data between recruiters", async () => {
    const other = await login("other");
    const c = await agent.post("/api/candidates").set(H).send({ jobId, consentGiven: true });
    expect((await other.get(`/api/candidates/${c.body.candidate.id}`)).status).toBe(404);
    expect((await other.get(`/api/jobs/${jobId}`)).status).toBe(404);
    expect((await other.post("/api/candidates").set(H).send({ jobId, consentGiven: true })).status).toBe(404);
  });
});

describe.each(candidates)("analysis flow: $label", (fx) => {
  let id: string;

  it("upload resume → analysis completes through all stages", async () => {
    state.key = fx.key;
    const c = await agent.post("/api/candidates").set(H).send({ jobId, consentGiven: true });
    expect(c.status).toBe(201);
    id = c.body.candidate.id;
    const pdf = await makePdf(resumeText(fx.resume));
    const up = await agent.post(`/api/candidates/${id}/resume`).set(H).attach("file", pdf, "resume.pdf");
    expect(up.status).toBe(201);
    const start = await agent.post(`/api/candidates/${id}/analyze`).set(H);
    expect(start.status).toBe(202);
    const done = await waitDone(agent, id);
    expect(done.error).toBeNull();
    expect(done.status).toBe("COMPLETED");
  });

  it("extracts claims without inventing any", async () => {
    const r = await agent.get(`/api/candidates/${id}/claims`);
    expect(r.body.claims).toHaveLength(fx.claims.length);
    for (const c of r.body.claims) {
      expect(c.claimText).toBeTruthy();
      expect(c.category).toBeTruthy();
      expect(c.confidence).toBeGreaterThanOrEqual(0);
    }
  });

  it("stores evidence with source info, and embeds it in pgvector", async () => {
    const r = await agent.get(`/api/candidates/${id}/evidence`);
    const gh = r.body.evidence.filter((e: { source: string }) => e.source === "GITHUB");
    if (fx.github) {
      expect(gh.length).toBeGreaterThan(0);
      for (const e of gh) {
        expect(e.sourceUrl).toContain("github.com");
        expect(e.collectedAt).toBeTruthy();
        expect(e.evidenceType).toBeTruthy();
      }
    } else {
      expect(gh).toHaveLength(0);
    }
    const [{ missing }] = await prisma.$queryRaw<{ missing: bigint }[]>`SELECT count(*) missing FROM "Evidence" WHERE "candidateId" = ${id} AND "embedding" IS NULL`;
    expect(Number(missing)).toBe(0);
  });

  it("verifies every claim; every non-trivial verdict is traceable to evidence", async () => {
    const r = await agent.get(`/api/candidates/${id}/verification`);
    expect(r.body.results).toHaveLength(fx.claims.length);
    for (const v of r.body.results) {
      expect(["VERIFIED", "PARTIAL", "UNVERIFIED", "CONTRADICTED"]).toContain(v.verdict);
      expect(v.reason).toBeTruthy();
      if (v.verdict === "VERIFIED" || v.verdict === "PARTIAL") {
        expect(v.evidence.some((e: { source: string }) => e.source !== "RESUME")).toBe(true);
      }
      if (v.verdict === "CONTRADICTED") expect(v.evidence.length).toBeGreaterThan(0);
    }
    const contradicted = r.body.results.filter((v: { verdict: string }) => v.verdict === "CONTRADICTED").length;
    expect(contradicted, JSON.stringify(r.body.results.map((v: { claim: { claimText: string }; verdict: string; evidence: unknown[] }) => [v.claim.claimText, v.verdict, v.evidence.length]))).toBe(fx.expect.contradicted ?? 0);
  });

  it("matches the JD and produces a deterministic score within expectations", async () => {
    const m = await agent.get(`/api/candidates/${id}/jd-match`);
    expect(m.status).toBe(200);
    expect(m.body.requirements).toHaveLength(5);
    const s = await agent.get(`/api/candidates/${id}/score`);
    const overall = s.body.score.overall as number;
    if (fx.expect.minOverall !== undefined) expect(overall).toBeGreaterThanOrEqual(fx.expect.minOverall);
    if (fx.expect.maxOverall !== undefined) expect(overall).toBeLessThanOrEqual(fx.expect.maxOverall);
    expect(s.body.score.weightsUsed).toEqual({ requiredSkill: 0.4, verifiedExperience: 0.2, projectRelevance: 0.15, technicalEvidence: 0.15, consistency: 0.1 });
    expect(s.body.score.explanation).toBeTruthy();
  });

  it("shortlisting is a manual recruiter action and can be undone", async () => {
    const before = await agent.get(`/api/candidates/${id}`);
    expect(before.body.candidate.shortlist).toBeNull();
    expect((await agent.post(`/api/candidates/${id}/shortlist`).set(H).send({ decision: "REVIEW", notes: "check refs" })).status).toBe(200);
    expect((await agent.delete(`/api/candidates/${id}/shortlist`).set(H)).status).toBe(200);
  });
});

describe("cross-candidate behaviour", () => {
  it("ranks the strong candidate first in a comparison", async () => {
    const list = await agent.get("/api/candidates");
    const analyzed = list.body.candidates.filter((c: { matchScore: number | null }) => c.matchScore !== null);
    expect(analyzed).toHaveLength(5);
    const r = await agent.post("/api/candidates/compare").set(H).send({ ids: analyzed.map((c: { id: string }) => c.id) });
    expect(r.body.candidates[0].name).toBe("Strong Candidate");
    for (const c of r.body.candidates) expect(c.explanation).toBeTruthy();
  });
  it("dashboard counts reflect the data", async () => {
    const r = await agent.get("/api/dashboard");
    expect(r.body.stats.analyzed).toBe(5);
    expect(r.body.stats.totalJobs).toBe(1);
  });
});

describe("profile URLs without a protocol", () => {
  it("accepts and canonicalizes protocol-less URLs entered by the recruiter", async () => {
    const c = await agent.post("/api/candidates").set(H).send({ jobId, consentGiven: true, githubUrl: "www.github.com/fixture-strong", linkedinUrl: "linkedin.com/in/prasannasubramani", leetcodeUrl: "leetcode.com/prasanna" });
    expect(c.status).toBe(201);
    const urls = Object.fromEntries(c.body.candidate.externalProfiles.map((p: { provider: string; url: string }) => [p.provider, p.url]));
    expect(urls).toEqual({
      GITHUB: "https://github.com/fixture-strong",
      LINKEDIN: "https://www.linkedin.com/in/prasannasubramani",
      LEETCODE: "https://leetcode.com/u/prasanna",
    });
  });
  it("still rejects URLs on the wrong host with a clear message", async () => {
    const r = await agent.post("/api/candidates").set(H).send({ jobId, consentGiven: true, githubUrl: "evil.com/fixture-strong" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/github/i);
  });
  it("uses protocol-less links found in the resume and collects GitHub evidence from them", async () => {
    state.key = "strong";
    const fx = candidates[0];
    const original = { g: fx.resume.githubUrl, l: fx.resume.linkedinUrl };
    fx.resume.githubUrl = "github.com/fixture-strong"; // as printed in a resume, no https://
    fx.resume.linkedinUrl = "linkedin.com/in/prasannasubramani";
    try {
      const c = await agent.post("/api/candidates").set(H).send({ jobId, consentGiven: true });
      const id = c.body.candidate.id;
      await agent.post(`/api/candidates/${id}/resume`).set(H).attach("file", await makePdf(resumeText(fx.resume)), "r.pdf");
      await agent.post(`/api/candidates/${id}/analyze`).set(H);
      const done = await waitDone(agent, id);
      expect(done.status).toBe("COMPLETED");
      expect(JSON.stringify(done.warnings)).not.toMatch(/not a valid|invalid/i);
      const cand = await agent.get(`/api/candidates/${id}`);
      const urls = Object.fromEntries(cand.body.candidate.externalProfiles.map((p: { provider: string; url: string }) => [p.provider, p.url]));
      expect(urls.GITHUB).toBe("https://github.com/fixture-strong");
      expect(urls.LINKEDIN).toBe("https://www.linkedin.com/in/prasannasubramani");
      const ev = await agent.get(`/api/candidates/${id}/evidence`);
      expect(ev.body.evidence.some((e: { source: string }) => e.source === "GITHUB")).toBe(true);
    } finally {
      fx.resume.githubUrl = original.g;
      fx.resume.linkedinUrl = original.l;
    }
  });
});

describe("resilience", () => {
  it("completes with a warning when GitHub is unavailable", async () => {
    state.key = "strong";
    const c = await agent.post("/api/candidates").set(H).send({ jobId, consentGiven: true, githubUrl: "https://github.com/ghost-user-404" });
    const id = c.body.candidate.id;
    await agent.post(`/api/candidates/${id}/resume`).set(H).attach("file", await makePdf(resumeText(candidates[0].resume)), "r.pdf");
    await agent.post(`/api/candidates/${id}/analyze`).set(H);
    const done = await waitDone(agent, id);
    expect(done.status).toBe("COMPLETED");
    expect(JSON.stringify(done.warnings)).toMatch(/GitHub user was not found/);
    expect(JSON.stringify(done.warnings)).toMatch(/still be evaluated/);
  });
  it("skips external collection when consent is not recorded", async () => {
    state.key = "strong";
    const c = await agent.post("/api/candidates").set(H).send({ jobId, consentGiven: false, githubUrl: "https://github.com/fixture-strong" });
    const id = c.body.candidate.id;
    await agent.post(`/api/candidates/${id}/resume`).set(H).attach("file", await makePdf(resumeText(candidates[0].resume)), "r.pdf");
    await agent.post(`/api/candidates/${id}/analyze`).set(H);
    const done = await waitDone(agent, id);
    expect(done.status).toBe("COMPLETED");
    expect(JSON.stringify(done.warnings)).toMatch(/consent/);
    const ev = await agent.get(`/api/candidates/${id}/evidence`);
    expect(ev.body.evidence.filter((e: { source: string }) => e.source === "GITHUB")).toHaveLength(0);
  });
  it("deleting a candidate removes all derived data", async () => {
    const list = await agent.get("/api/candidates");
    const id = list.body.candidates[0].id;
    expect((await agent.delete(`/api/candidates/${id}`).set(H)).status).toBe(200);
    for (const t of ["Evidence", "ResumeClaim", "VerificationResult", "Resume", "CandidateScore"]) {
      const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM "${t}" WHERE "candidateId" = $1`, id);
      expect(Number(rows[0].n)).toBe(0);
    }
  });
});
