import type { Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { badRequest } from "../utils/errors";
import * as cand from "../services/candidateService";
import * as q from "../services/queryService";
import { MAX_RESUME_BYTES, saveResume } from "../services/resumeService";
import { latestAnalysis, startAnalysis } from "../services/analysisService";
import { collectAndStoreGithub } from "../services/githubService";
import { storeEvidence } from "../services/evidenceService";
import { candidateProvidedLinkedIn, linkedInEvidence } from "../integrations/linkedin/candidateProvided";
import { candidateProvidedLeetCode, leetCodeEvidence } from "../integrations/leetcode/candidateProvided";

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_RESUME_BYTES, files: 1 } });

const id = (req: Request) => z.string().uuid().parse(req.params.id);
// Any text up to 300 chars: protocol is optional, and the real validation/canonicalization is normalizeProfileUrl.
const url = z.string().trim().max(300).nullish().or(z.literal("").transform(() => null));

const createSchema = z.object({
  jobId: z.string().uuid(),
  name: z.string().trim().max(200).nullish(),
  email: z.string().trim().email().nullish().or(z.literal("").transform(() => null)),
  githubUrl: url,
  linkedinUrl: url,
  leetcodeUrl: url,
  consentGiven: z.boolean(),
});

export async function create(req: Request, res: Response) {
  res.status(201).json({ candidate: await cand.createCandidate(req.userId!, createSchema.parse(req.body)) });
}
export async function list(req: Request, res: Response) {
  const jobId = typeof req.query.jobId === "string" ? z.string().uuid().parse(req.query.jobId) : undefined;
  const rows = await cand.listCandidates(req.userId!, jobId);
  res.json({
    candidates: rows.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      job: c.job,
      status: c.analysisJobs[0]?.status ?? "UPLOADED",
      matchScore: c.scores[0]?.overall ?? null,
      verification: q.summarize(c.verifications.map((v) => v.verdict)),
      decision: c.shortlist?.decision ?? null,
      createdAt: c.createdAt,
    })),
  });
}
export async function get(req: Request, res: Response) {
  res.json({ candidate: await cand.getCandidate(req.userId!, id(req)) });
}
export async function remove(req: Request, res: Response) {
  await cand.deleteCandidate(req.userId!, id(req));
  res.json({ ok: true });
}
export async function uploadResume(req: Request, res: Response) {
  const cid = id(req);
  await cand.ownedCandidate(req.userId!, cid);
  if (!req.file) throw badRequest("Attach a PDF file in the 'file' field.");
  const r = await saveResume(cid, req.file);
  res.status(201).json({ resume: { id: r.id, fileName: r.fileName, sizeBytes: r.sizeBytes, characters: r.extractedText?.length ?? 0 } });
}
export async function getResume(req: Request, res: Response) {
  const cid = id(req);
  await cand.ownedCandidate(req.userId!, cid);
  const r = await prisma.resume.findFirst({
    where: { candidateId: cid },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, sizeBytes: true, createdAt: true, extractedText: true, structuredData: true },
  });
  res.json({ resume: r });
}
export async function analyze(req: Request, res: Response) {
  res.status(202).json({ analysis: await startAnalysis(req.userId!, id(req)) });
}
export async function analysis(req: Request, res: Response) {
  res.json({ analysis: await latestAnalysis(req.userId!, id(req)) });
}
export async function claims(req: Request, res: Response) {
  res.json({ claims: await q.getClaims(req.userId!, id(req)) });
}
export async function evidence(req: Request, res: Response) {
  res.json({ evidence: await q.getEvidence(req.userId!, id(req)) });
}
export async function verification(req: Request, res: Response) {
  res.json(await q.getVerification(req.userId!, id(req)));
}
export async function jdMatch(req: Request, res: Response) {
  res.json(await q.getJdMatch(req.userId!, id(req)));
}
export async function score(req: Request, res: Response) {
  res.json({ score: await q.getScore(req.userId!, id(req)) });
}
export async function report(req: Request, res: Response) {
  res.json(await q.report(req.userId!, id(req)));
}
export async function notes(req: Request, res: Response) {
  const { notes } = z.object({ notes: z.string().max(5000) }).parse(req.body);
  await cand.updateNotes(req.userId!, id(req), notes);
  res.json({ ok: true });
}

export async function github(req: Request, res: Response) {
  const cid = id(req);
  const c = await cand.ownedCandidate(req.userId!, cid);
  const { githubUrl } = z.object({ githubUrl: z.string().trim().max(300) }).parse(req.body);
  const profile = await cand.upsertProfileUrl(cid, "GITHUB", githubUrl, c.consentGiven);
  if (!c.consentGiven) throw badRequest("Candidate consent must be recorded before collecting external data.");
  res.json(await collectAndStoreGithub(cid, profile.url, c.consentGiven));
}
export async function getGithub(req: Request, res: Response) {
  const cid = id(req);
  await cand.ownedCandidate(req.userId!, cid);
  const ext = await prisma.externalProfile.findUnique({
    where: { candidateId_provider: { candidateId: cid, provider: "GITHUB" } },
    include: { github: { include: { repositories: { orderBy: { repoPushedAt: "desc" }, select: { id: true, name: true, url: true, description: true, languages: true, topics: true, repoPushedAt: true } } } } },
  });
  if (!ext) return res.json({ github: null });
  const { rawData: _raw, ...rest } = ext;
  res.json({ github: { ...rest, github: ext.github ? { ...ext.github, rawData: undefined } : null } });
}

/** Candidate-provided LinkedIn data (pasted/exported). The URL is stored but never scraped. */
export async function linkedin(req: Request, res: Response) {
  const cid = id(req);
  const c = await cand.ownedCandidate(req.userId!, cid);
  if (!c.consentGiven) throw badRequest("Candidate consent must be recorded before storing external data.");
  const body = z.object({ profileUrl: url, data: z.unknown() }).parse(req.body);
  const profileUrl = body.profileUrl ? (await cand.upsertProfileUrl(cid, "LINKEDIN", body.profileUrl, true)).url : null;
  const profile = await candidateProvidedLinkedIn.getProfile({ exportData: body.data });
  if (!profile) throw badRequest("Provide the LinkedIn profile data in 'data'.");
  const n = await storeEvidence(cid, "LINKEDIN", linkedInEvidence(profile, profileUrl));
  res.json({ ok: true, evidenceItems: n });
}
export async function leetcode(req: Request, res: Response) {
  const cid = id(req);
  const c = await cand.ownedCandidate(req.userId!, cid);
  if (!c.consentGiven) throw badRequest("Candidate consent must be recorded before storing external data.");
  const body = z.object({ profileUrl: url, data: z.unknown() }).parse(req.body);
  const profileUrl = body.profileUrl ? (await cand.upsertProfileUrl(cid, "LEETCODE", body.profileUrl, true)).url : null;
  const profile = await candidateProvidedLeetCode.getProfile({ exportData: body.data });
  if (!profile) throw badRequest("Provide the LeetCode summary in 'data'.");
  const n = await storeEvidence(cid, "LEETCODE", [leetCodeEvidence(profile, profileUrl)]);
  res.json({ ok: true, evidenceItems: n });
}

// Shortlisting: always a recruiter action; never automatic.
export async function shortlist(req: Request, res: Response) {
  const cid = id(req);
  await cand.ownedCandidate(req.userId!, cid);
  const b = z.object({ decision: z.enum(["SHORTLISTED", "REJECTED", "REVIEW"]).default("SHORTLISTED"), notes: z.string().max(5000).nullish() }).parse(req.body ?? {});
  const row = await prisma.shortlist.upsert({
    where: { candidateId: cid },
    update: { decision: b.decision, notes: b.notes ?? null },
    create: { candidateId: cid, userId: req.userId!, decision: b.decision, notes: b.notes ?? null },
  });
  res.json({ shortlist: row });
}
export async function unshortlist(req: Request, res: Response) {
  const cid = id(req);
  await cand.ownedCandidate(req.userId!, cid);
  await prisma.shortlist.deleteMany({ where: { candidateId: cid } });
  res.json({ ok: true });
}
export async function shortlistList(req: Request, res: Response) {
  res.json({ shortlist: await q.listShortlist(req.userId!) });
}
export async function dashboard(req: Request, res: Response) {
  res.json(await q.dashboard(req.userId!));
}
export async function compare(req: Request, res: Response) {
  const { ids } = z.object({ ids: z.array(z.string().uuid()).min(2).max(6) }).parse(req.body);
  res.json({ candidates: await q.compare(req.userId!, ids) });
}
