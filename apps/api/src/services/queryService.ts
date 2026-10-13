import { prisma } from "../lib/prisma";
import { notFound } from "../utils/errors";
import { ownedCandidate } from "./candidateService";

export async function getClaims(userId: string, candidateId: string) {
  await ownedCandidate(userId, candidateId);
  return prisma.resumeClaim.findMany({
    where: { candidateId },
    orderBy: { createdAt: "asc" },
    select: { id: true, claimText: true, category: true, sourceLocation: true, confidence: true, canonicalSkill: true, createdAt: true },
  });
}

export async function getEvidence(userId: string, candidateId: string) {
  await ownedCandidate(userId, candidateId);
  return prisma.evidence.findMany({
    where: { candidateId },
    orderBy: [{ source: "asc" }, { collectedAt: "desc" }],
    select: { id: true, source: true, sourceUrl: true, evidenceType: true, evidenceText: true, metadata: true, collectedAt: true },
  });
}

export async function getVerification(userId: string, candidateId: string) {
  await ownedCandidate(userId, candidateId);
  const rows = await prisma.verificationResult.findMany({
    where: { candidateId },
    orderBy: { createdAt: "asc" },
    include: {
      claim: { select: { id: true, claimText: true, category: true, sourceLocation: true, confidence: true } },
      evidence: {
        include: { evidence: { select: { id: true, source: true, sourceUrl: true, evidenceType: true, evidenceText: true, collectedAt: true } } },
        orderBy: { similarity: "desc" },
      },
    },
  });
  const results = rows.map((r) => ({
    id: r.id,
    claim: r.claim,
    verdict: r.verdict,
    confidence: r.confidence,
    reason: r.reason,
    evidence: r.evidence.map((e) => ({ ...e.evidence, similarity: e.similarity })),
  }));
  const summary = { VERIFIED: 0, PARTIAL: 0, UNVERIFIED: 0, CONTRADICTED: 0 };
  for (const r of results) summary[r.verdict]++;
  return { summary, results };
}

export async function getScore(userId: string, candidateId: string) {
  await ownedCandidate(userId, candidateId);
  const s = await prisma.candidateScore.findFirst({ where: { candidateId }, orderBy: { createdAt: "desc" } });
  if (!s) throw notFound("No score yet. Run the analysis first.");
  return s;
}

export async function getJdMatch(userId: string, candidateId: string) {
  const s = await getScore(userId, candidateId);
  const b = s.breakdown as Record<string, unknown>;
  return { requirements: b.requirements, projects: b.projects, subScores: b.subScores, claimedYears: b.claimedYears, requiredYears: b.requiredYears, components: s.components, weights: s.weightsUsed, overall: s.overall };
}

export async function dashboard(userId: string) {
  const [totalJobs, activeJobs, totalCandidates, analyzed, shortlisted, avg, recent] = await Promise.all([
    prisma.job.count({ where: { userId } }),
    prisma.job.count({ where: { userId, status: "ACTIVE" } }),
    prisma.candidate.count({ where: { userId } }),
    prisma.candidate.count({ where: { userId, analysisJobs: { some: { status: "COMPLETED" } } } }),
    prisma.shortlist.count({ where: { userId, decision: "SHORTLISTED" } }),
    prisma.candidateScore.aggregate({ where: { candidate: { userId } }, _avg: { overall: true } }),
    prisma.candidate.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        job: { select: { id: true, title: true } },
        scores: { orderBy: { createdAt: "desc" }, take: 1, select: { overall: true } },
        verifications: { select: { verdict: true } },
        analysisJobs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      },
    }),
  ]);
  return {
    stats: { totalJobs, activeJobs, totalCandidates, analyzed, shortlisted, averageMatchScore: avg._avg.overall ? Math.round(avg._avg.overall * 10) / 10 : null },
    recent: recent.map((c) => ({
      id: c.id,
      name: c.name,
      job: c.job,
      matchScore: c.scores[0]?.overall ?? null,
      status: c.analysisJobs[0]?.status ?? "UPLOADED",
      verification: summarize(c.verifications.map((v) => v.verdict)),
      createdAt: c.createdAt,
    })),
  };
}

export function summarize(verdicts: string[]) {
  const s = { VERIFIED: 0, PARTIAL: 0, UNVERIFIED: 0, CONTRADICTED: 0 } as Record<string, number>;
  for (const v of verdicts) s[v]++;
  return s;
}

export async function compare(userId: string, ids: string[]) {
  const rows = await prisma.candidate.findMany({
    where: { userId, id: { in: ids } },
    include: {
      job: { select: { id: true, title: true } },
      scores: { orderBy: { createdAt: "desc" }, take: 1 },
      verifications: { select: { verdict: true } },
      shortlist: { select: { decision: true } },
    },
  });
  return rows
    .map((c) => {
      const s = c.scores[0];
      const b = (s?.breakdown ?? {}) as { subScores?: { requiredSkillMatch?: number }; claimedYears?: number; requirements?: { kind: string; skill: string; status: string }[] };
      return {
        id: c.id,
        name: c.name,
        job: c.job,
        overall: s?.overall ?? null,
        components: s?.components ?? null,
        requiredSkillMatch: b.subScores?.requiredSkillMatch ?? null,
        claimedYears: b.claimedYears ?? null,
        requirements: b.requirements ?? [],
        verification: summarize(c.verifications.map((v) => v.verdict)),
        explanation: s?.explanation ?? null,
        decision: c.shortlist?.decision ?? null,
      };
    })
    .sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
}

export async function listShortlist(userId: string) {
  const rows = await prisma.shortlist.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { candidate: { select: { id: true, name: true, job: { select: { id: true, title: true } }, scores: { orderBy: { createdAt: "desc" }, take: 1, select: { overall: true } } } } },
  });
  return rows.map((r) => ({ id: r.id, decision: r.decision, notes: r.notes, updatedAt: r.updatedAt, candidate: { id: r.candidate.id, name: r.candidate.name, job: r.candidate.job, matchScore: r.candidate.scores[0]?.overall ?? null } }));
}

/** Everything needed for the printable candidate report. */
export async function report(userId: string, candidateId: string) {
  const c = await ownedCandidate(userId, candidateId);
  const [verification, score, job, shortlist, profiles] = await Promise.all([
    getVerification(userId, candidateId),
    prisma.candidateScore.findFirst({ where: { candidateId }, orderBy: { createdAt: "desc" } }),
    prisma.job.findUnique({ where: { id: c.jobId }, include: { requirements: true } }),
    prisma.shortlist.findUnique({ where: { candidateId } }),
    prisma.externalProfile.findMany({ where: { candidateId }, select: { provider: true, url: true, origin: true, collectedAt: true } }),
  ]);
  return { candidate: { id: c.id, name: c.name, email: c.email, recruiterNotes: c.recruiterNotes }, job, verification, score, decision: shortlist, sources: profiles, generatedAt: new Date() };
}
