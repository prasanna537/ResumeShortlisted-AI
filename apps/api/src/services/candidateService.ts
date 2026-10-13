import fs from "fs/promises";
import path from "path";
import { prisma } from "../lib/prisma";
import { notFound } from "../utils/errors";
import { badRequest } from "../utils/errors";
import { InvalidProfileUrlError, normalizeProfileUrl } from "../utils/profileUrl";

export interface CandidateInput {
  jobId: string;
  name?: string | null;
  email?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  leetcodeUrl?: string | null;
  consentGiven: boolean;
}

/**
 * Validates and canonicalizes a profile URL (protocol and "www." optional) and stores the canonical HTTPS form.
 * LinkedIn/LeetCode URLs are only stored, never fetched; hosts are restricted to the expected providers.
 */
export async function upsertProfileUrl(candidateId: string, provider: "GITHUB" | "LINKEDIN" | "LEETCODE", raw: string, consent: boolean) {
  let n;
  try {
    n = normalizeProfileUrl(provider, raw);
  } catch (e) {
    if (e instanceof InvalidProfileUrlError) throw badRequest(`Invalid ${provider.toLowerCase()} URL: ${e.message}`);
    throw e;
  }
  return prisma.externalProfile.upsert({
    where: { candidateId_provider: { candidateId, provider } },
    update: { url: n.url, username: n.username, consentGiven: consent },
    create: { candidateId, provider, url: n.url, username: n.username, consentGiven: consent, origin: "CANDIDATE_PROVIDED" },
  });
}

export async function createCandidate(userId: string, input: CandidateInput) {
  const job = await prisma.job.findFirst({ where: { id: input.jobId, userId } });
  if (!job) throw notFound("Job not found");
  const c = await prisma.candidate.create({
    data: {
      userId,
      jobId: input.jobId,
      name: input.name ?? null,
      email: input.email ?? null,
      consentGiven: input.consentGiven,
      consentAt: input.consentGiven ? new Date() : null,
    },
  });
  if (input.githubUrl) await upsertProfileUrl(c.id, "GITHUB", input.githubUrl, input.consentGiven);
  if (input.linkedinUrl) await upsertProfileUrl(c.id, "LINKEDIN", input.linkedinUrl, input.consentGiven);
  if (input.leetcodeUrl) await upsertProfileUrl(c.id, "LEETCODE", input.leetcodeUrl, input.consentGiven);
  return getCandidate(userId, c.id);
}

const latestScore = { scores: { orderBy: { createdAt: "desc" as const }, take: 1 } };

export async function ownedCandidate(userId: string, id: string) {
  const c = await prisma.candidate.findFirst({ where: { id, userId } });
  if (!c) throw notFound("Candidate not found");
  return c;
}

export async function getCandidate(userId: string, id: string) {
  const c = await prisma.candidate.findFirst({
    where: { id, userId },
    include: {
      job: { select: { id: true, title: true, company: true } },
      resumes: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, fileName: true, sizeBytes: true, createdAt: true, structuredData: true } },
      externalProfiles: { select: { id: true, provider: true, url: true, username: true, origin: true, consentGiven: true, collectedAt: true, lastError: true } },
      analysisJobs: { orderBy: { createdAt: "desc" }, take: 1 },
      shortlist: true,
      ...latestScore,
    },
  });
  if (!c) throw notFound("Candidate not found");
  return c;
}

export async function listCandidates(userId: string, jobId?: string) {
  return prisma.candidate.findMany({
    where: { userId, ...(jobId ? { jobId } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      job: { select: { id: true, title: true } },
      analysisJobs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      shortlist: { select: { decision: true } },
      verifications: { select: { verdict: true } },
      ...latestScore,
    },
  });
}

export async function updateNotes(userId: string, id: string, notes: string) {
  await ownedCandidate(userId, id);
  return prisma.candidate.update({ where: { id }, data: { recruiterNotes: notes } });
}

/** Deletes the candidate, all derived data (cascade) and the stored resume files. */
export async function deleteCandidate(userId: string, id: string) {
  await ownedCandidate(userId, id);
  const resumes = await prisma.resume.findMany({ where: { candidateId: id }, select: { storagePath: true } });
  await prisma.candidate.delete({ where: { id } });
  const dir = path.resolve(__dirname, "../../uploads");
  await Promise.all(resumes.map((r) => fs.unlink(path.join(dir, path.basename(r.storagePath))).catch(() => undefined)));
}
