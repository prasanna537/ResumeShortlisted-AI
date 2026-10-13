import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { geminiEmbeddings } from "../ai/gemini";
import { setEmbedding } from "../lib/vector";
import type { EvidenceDraft } from "../integrations/github/evidence";
import { detectSkills } from "./skillDetection";
import type { ParsedResume } from "../ai/schemas";

/** Replaces all evidence of a source for a candidate (re-analysis must not accumulate stale items). */
export async function storeEvidence(
  candidateId: string,
  source: EvidenceDraft["source"],
  drafts: EvidenceDraft[],
  repoIds: Record<string, string> = {},
) {
  await prisma.evidence.deleteMany({ where: { candidateId, source } });
  if (!drafts.length) return 0;
  const now = new Date();
  await prisma.evidence.createMany({
    data: drafts.map((d) => ({
      candidateId,
      source: d.source,
      sourceUrl: d.sourceUrl,
      evidenceType: d.evidenceType,
      evidenceText: d.evidenceText.slice(0, 4000),
      metadata: d.metadata as Prisma.InputJsonValue,
      collectedAt: now,
      githubRepoId: d.repoName ? repoIds[d.repoName] ?? null : null,
    })),
  });
  return drafts.length;
}

/** Resume-derived evidence: used for consistency checks only; never counted as independent verification. */
export function resumeEvidence(r: ParsedResume): EvidenceDraft[] {
  const out: EvidenceDraft[] = [];
  const d = (type: string, text: string, extra: Record<string, unknown> = {}): EvidenceDraft => ({
    source: "RESUME",
    sourceUrl: null,
    evidenceType: type,
    evidenceText: text,
    metadata: { skills: detectSkills(text), ...extra },
  });
  for (const e of r.experience) {
    out.push(d("experience", `Resume experience: ${e.title}${e.company ? ` at ${e.company}` : ""} (${e.startDate ?? "?"} - ${e.endDate ?? "?"}). ${e.description}`, { start: e.startDate, end: e.endDate }));
  }
  for (const p of r.projects) {
    out.push(d("project", `Resume project "${p.name}": ${p.description} Technologies: ${p.technologies.join(", ")}`));
  }
  for (const e of r.education) {
    out.push(d("education", `Resume education: ${[e.degree, e.field].filter(Boolean).join(" in ")} at ${e.institution}${e.year ? ` (${e.year})` : ""}`));
  }
  if (r.certifications.length) out.push(d("certifications", `Resume certifications: ${r.certifications.join(", ")}`));
  return out;
}

/** Generates and stores embeddings for evidence and claims that lack one. */
export async function embedMissing(candidateId: string) {
  const ev = await prisma.$queryRaw<{ id: string; text: string }[]>`
    SELECT "id", "evidenceText" AS text FROM "Evidence" WHERE "candidateId" = ${candidateId} AND "embedding" IS NULL`;
  if (ev.length) {
    const vecs = await geminiEmbeddings.embed(ev.map((e) => e.text), "RETRIEVAL_DOCUMENT");
    for (let i = 0; i < ev.length; i++) await setEmbedding("Evidence", ev[i].id, vecs[i]);
  }
  const cl = await prisma.$queryRaw<{ id: string; text: string }[]>`
    SELECT "id", "claimText" AS text FROM "ResumeClaim" WHERE "candidateId" = ${candidateId} AND "embedding" IS NULL`;
  if (cl.length) {
    const vecs = await geminiEmbeddings.embed(cl.map((c) => c.text), "RETRIEVAL_QUERY");
    for (let i = 0; i < cl.length; i++) await setEmbedding("ResumeClaim", cl[i].id, vecs[i]);
  }
  return { evidence: ev.length, claims: cl.length };
}
