import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { generateStructured } from "../ai/gemini";
import { explanationPrompt, projectRelevancePrompt, SAFETY } from "../ai/prompts";
import { explanationSchema, projectRelevanceSchema, type ParsedResume } from "../ai/schemas";
import { SEMANTIC_MATCH_THRESHOLD, WEIGHTS } from "../config/scoring";
import { getEmbedding, toVectorLiteral } from "../lib/vector";
import { claimedYears } from "../utils/experience";
import { detectSkills } from "./skillDetection";
import { canonicalSkill } from "./skillNormalizer";
import { embedMissingRequirements } from "./jobService";
import {
  computeScore,
  fallbackRelevance,
  matchRequirements,
  type ClaimInput,
  type ProjectInput,
  type Verdict,
} from "./matchingEngine";

export type Stage = (s: "MATCHING_JD" | "CALCULATING_SCORE") => Promise<void>;

async function semanticClaims(candidateId: string, reqIds: string[]) {
  const out = new Map<string, string>();
  for (const id of reqIds) {
    const vec = await getEmbedding("JobRequirement", id);
    if (!vec) continue;
    const lit = toVectorLiteral(vec);
    const rows = await prisma.$queryRaw<{ id: string; sim: number }[]>(Prisma.sql`
      SELECT "id", 1 - ("embedding" <=> ${lit}::vector) AS sim
      FROM "ResumeClaim" WHERE "candidateId" = ${candidateId} AND "embedding" IS NOT NULL
      ORDER BY "embedding" <=> ${lit}::vector LIMIT 1`);
    if (rows[0] && Number(rows[0].sim) >= SEMANTIC_MATCH_THRESHOLD) out.set(id, rows[0].id);
  }
  return out;
}

export async function runMatching(candidateId: string, stage: Stage = async () => undefined) {
  await stage("MATCHING_JD");
  const cand = await prisma.candidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: {
      job: { include: { requirements: true } },
      resumes: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const job = cand.job;
  try {
    await embedMissingRequirements(job.id);
  } catch {
    /* semantic matching then simply falls back to exact/evidence matching */
  }

  const claimRows = await prisma.resumeClaim.findMany({
    where: { candidateId },
    include: { verification: { include: { evidence: { include: { evidence: { select: { id: true, source: true } } } } } } },
  });
  const claims: ClaimInput[] = claimRows.map((c) => ({
    id: c.id,
    canonicalSkill: c.canonicalSkill,
    claimText: c.claimText,
    category: c.category,
    sourceLocation: c.sourceLocation,
    verdict: (c.verification?.verdict as Verdict | undefined) ?? null,
    independentEvidenceIds: (c.verification?.evidence ?? []).filter((v) => v.evidence.source !== "RESUME").map((v) => v.evidenceId),
  }));

  // canonical skill -> independent evidence ids
  const ev = await prisma.evidence.findMany({ where: { candidateId, source: { not: "RESUME" } }, select: { id: true, metadata: true } });
  const skillEvidence = new Map<string, string[]>();
  for (const e of ev) {
    const skills = ((e.metadata as { skills?: string[] } | null)?.skills ?? []).filter(Boolean);
    for (const s of skills) skillEvidence.set(s, [...(skillEvidence.get(s) ?? []), e.id]);
  }

  const reqs = job.requirements.map((r) => ({ id: r.id, skill: r.skill, canonicalSkill: r.canonicalSkill, kind: r.kind }));
  const unmatched = reqs.filter((r) => !claims.some((c) => c.canonicalSkill === r.canonicalSkill)).map((r) => r.id);
  const semantic = await semanticClaims(candidateId, unmatched).catch(() => new Map<string, string>());
  const matches = matchRequirements(reqs, claims, skillEvidence, semantic);

  // Projects
  const structured = (cand.resumes[0]?.structuredData ?? null) as ParsedResume | null;
  const requiredCanon = reqs.filter((r) => r.kind === "REQUIRED").map((r) => r.canonicalSkill);
  const projList = (structured?.projects ?? []).slice(0, 5);
  let relevance = new Map<string, { relevance: ProjectInput["relevance"]; reason: string }>();
  if (projList.length) {
    try {
      const out = await generateStructured(
        projectRelevanceSchema,
        projectRelevancePrompt(reqs.map((r) => r.skill), projList),
        SAFETY,
      );
      relevance = new Map(out.projects.map((p) => [p.name.toLowerCase(), { relevance: p.relevance, reason: p.reason }]));
    } catch {
      /* deterministic fallback below */
    }
  }
  const projects = projList.map((p) => {
    const ai = relevance.get(p.name.toLowerCase());
    const skills = [...new Set([...p.technologies.map(canonicalSkill), ...detectSkills(`${p.name} ${p.description}`)])];
    const rel = ai?.relevance ?? fallbackRelevance(skills, requiredCanon);
    const claim = claims.find(
      (c) => c.category === "PROJECT" && c.verdict && `${c.sourceLocation ?? ""} ${c.claimText}`.toLowerCase().includes(p.name.toLowerCase()),
    );
    return { name: p.name, relevance: rel, verdict: claim?.verdict ?? null, reason: ai?.reason ?? "Matched by technology overlap with the required skills." };
  });

  await stage("CALCULATING_SCORE");
  const years = claimedYears((structured?.experience ?? []).map((e) => ({ start: e.startDate, end: e.endDate })));
  const score = computeScore({
    matches,
    claims,
    projects,
    claimedYears: years,
    requiredYears: job.experienceYears,
    weights: { ...WEIGHTS },
  });

  const counts = { VERIFIED: 0, PARTIAL: 0, UNVERIFIED: 0, CONTRADICTED: 0 } as Record<Verdict, number>;
  for (const c of claims) if (c.verdict) counts[c.verdict]++;

  const facts =
    `Overall ${score.overall}/100. Components (0-1): ${JSON.stringify(score.components)}. ` +
    `Required skills: ${matches.filter((m) => m.kind === "REQUIRED").map((m) => `${m.skill}=${m.status}`).join(", ") || "none"}. ` +
    `Claim verdicts: ${JSON.stringify(counts)}. Claimed experience ${years} years; required ${job.experienceYears ?? "not specified"}.`;
  let explanation: string;
  try {
    explanation = (await generateStructured(explanationSchema, explanationPrompt(facts), SAFETY)).explanation;
  } catch {
    explanation = `Overall match ${score.overall}%. ${facts} (Automated explanation unavailable; the figures above are computed by the application.)`;
  }

  await prisma.candidateScore.deleteMany({ where: { candidateId } });
  return prisma.candidateScore.create({
    data: {
      candidateId,
      jobId: job.id,
      overall: score.overall,
      components: score.components,
      weightsUsed: score.weights,
      breakdown: JSON.parse(
        JSON.stringify({ requirements: matches, projects, subScores: score.subScores, claimedYears: years, requiredYears: job.experienceYears, verdictCounts: counts }),
      ),
      explanation,
    },
  });
}
