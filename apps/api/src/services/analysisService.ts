import { prisma } from "../lib/prisma";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import { resumeEvidence, embedMissing, storeEvidence } from "./evidenceService";
import { asJson, extractAndStoreClaims, structureResume } from "./resumeService";
import { collectAndStoreGithub } from "./githubService";
import { upsertProfileUrl, ownedCandidate } from "./candidateService";
import { findProfileUrl } from "../utils/profileUrl";
import { verifyCandidateClaims } from "./verificationService";
import { runMatching } from "./matchingService";
import type { ParsedResume } from "../ai/schemas";
import type { AnalysisStatus } from "@prisma/client";

const STALE_MS = 10 * 60_000;

export async function startAnalysis(userId: string, candidateId: string) {
  const cand = await ownedCandidate(userId, candidateId);
  const resume = await prisma.resume.findFirst({ where: { candidateId }, orderBy: { createdAt: "desc" } });
  if (!resume) throw new AppError(400, "Upload a resume before starting the analysis.", "NO_RESUME");

  const running = await prisma.analysisJob.findFirst({
    where: { candidateId, status: { notIn: ["COMPLETED", "FAILED"] }, updatedAt: { gt: new Date(Date.now() - STALE_MS) } },
  });
  if (running) throw new AppError(409, "An analysis is already running for this candidate.", "ALREADY_RUNNING");

  const job = await prisma.analysisJob.create({ data: { candidateId, status: "UPLOADED", startedAt: new Date(), warnings: [] } });
  // Runs in-process (no queue infrastructure yet). Progress is persisted so the UI can poll it.
  void runPipeline(job.id, cand.id, resume.id).catch((e) => logger.error("pipeline crashed", { message: (e as Error).message }));
  return job;
}

export async function runPipeline(jobId: string, candidateId: string, resumeId: string) {
  const warnings: string[] = [];
  const set = (status: AnalysisStatus) => prisma.analysisJob.update({ where: { id: jobId }, data: { status, warnings } });
  try {
    const cand = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId } });
    const resume = await prisma.resume.findUniqueOrThrow({ where: { id: resumeId } });

    // 1. Parse + structure
    await set("PARSING");
    let structured = resume.structuredData as ParsedResume | null;
    if (!structured) {
      structured = await structureResume(resume.extractedText ?? "");
      await prisma.resume.update({ where: { id: resumeId }, data: { structuredData: asJson(structured) } });
    }
    await prisma.candidate.update({
      where: { id: candidateId },
      data: { name: cand.name ?? structured.name, email: cand.email ?? structured.email, phone: cand.phone ?? structured.phone },
    });
    await storeEvidence(candidateId, "RESUME", resumeEvidence(structured));

    // 2. Profile URLs found in the resume (only if the recruiter did not provide one)
    const existing = await prisma.externalProfile.findMany({ where: { candidateId } });
    const has = (p: string) => existing.some((e) => e.provider === p);
    for (const provider of ["GITHUB", "LINKEDIN", "LEETCODE"] as const) {
      if (has(provider)) continue;
      const fromAi = { GITHUB: structured.githubUrl, LINKEDIN: structured.linkedinUrl, LEETCODE: structured.leetcodeUrl }[provider];
      // AI-extracted link first; if it is missing or unusable, scan the raw resume text for one.
      const candidates = [fromAi, findProfileUrl(provider, resume.extractedText ?? "")].filter((u): u is string => !!u);
      let saved = false;
      for (const url of candidates) {
        try {
          await upsertProfileUrl(candidateId, provider, url, cand.consentGiven);
          saved = true;
          break;
        } catch {
          /* try the next candidate */
        }
      }
      if (!saved && fromAi) warnings.push(`The ${provider} link found in the resume ("${fromAi.slice(0, 60)}") is not a valid profile URL and was ignored.`);
    }

    // 3. Claims
    await set("EXTRACTING_CLAIMS");
    const n = await extractAndStoreClaims(candidateId, resumeId, structured);
    if (n === 0) warnings.push("No verifiable claims were found in the resume.");

    // 4. External evidence (permitted sources only)
    await set("COLLECTING_EVIDENCE");
    const gh = await prisma.externalProfile.findUnique({ where: { candidateId_provider: { candidateId, provider: "GITHUB" } } });
    if (!gh) {
      warnings.push("No GitHub profile provided. The candidate was evaluated using the resume and other available evidence.");
    } else if (!cand.consentGiven) {
      warnings.push("External data collection was skipped because candidate consent is not recorded.");
    } else {
      const r = await collectAndStoreGithub(candidateId, gh.url, cand.consentGiven);
      if (!r.ok) {
        warnings.push(`${r.error} The candidate can still be evaluated using the available resume and profile evidence.`);
      }
      warnings.push(...r.warnings);
    }

    // 5. Embeddings (pgvector)
    await set("GENERATING_EMBEDDINGS");
    await embedMissing(candidateId);

    // 6. Verification
    await set("VERIFYING");
    warnings.push(...(await verifyCandidateClaims(candidateId)));

    // 7-8. Matching + scoring
    await runMatching(candidateId, async (s) => {
      await set(s);
    });

    await prisma.analysisJob.update({ where: { id: jobId }, data: { status: "COMPLETED", finishedAt: new Date(), warnings, error: null } });
  } catch (e) {
    const message = e instanceof AppError ? e.message : "The analysis failed unexpectedly. Please try again.";
    logger.error("analysis failed", { jobId, message: (e as Error).message });
    await prisma.analysisJob
      .update({ where: { id: jobId }, data: { status: "FAILED", error: message, finishedAt: new Date(), warnings } })
      .catch(() => undefined);
  }
}

export async function latestAnalysis(userId: string, candidateId: string) {
  await ownedCandidate(userId, candidateId);
  return prisma.analysisJob.findFirst({ where: { candidateId }, orderBy: { createdAt: "desc" } });
}
