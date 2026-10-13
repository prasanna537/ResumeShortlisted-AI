import { prisma } from "../lib/prisma";
import { getEmbedding, similarEvidence } from "../lib/vector";

export interface RetrievedEvidence {
  id: string;
  source: "RESUME" | "GITHUB" | "LINKEDIN" | "LEETCODE";
  evidenceType: string;
  evidenceText: string;
  sourceUrl: string | null;
  similarity: number;
}

const MAX_EVIDENCE = 8;

/**
 * Retrieves the evidence most relevant to a claim:
 *  1. pgvector cosine similarity between the claim embedding and the candidate's evidence embeddings
 *  2. deterministic skill-tag hits (evidence whose detected skills include the claim's canonical skill)
 * Unrelated evidence is excluded by a minimum similarity threshold.
 */
export async function retrieveEvidenceForClaim(candidateId: string, claimId: string, canonical: string | null): Promise<RetrievedEvidence[]> {
  const vec = await getEmbedding("ResumeClaim", claimId);
  const hits = vec ? await similarEvidence(candidateId, vec, 6) : [];
  const sim = new Map(hits.map((h) => [h.id, h.similarity]));

  let tagged: { id: string }[] = [];
  if (canonical) {
    tagged = await prisma.evidence.findMany({
      where: { candidateId, metadata: { path: ["skills"], array_contains: canonical } },
      select: { id: true },
      take: 6,
    });
  }
  const ids = [...new Set([...hits.map((h) => h.id), ...tagged.map((t) => t.id)])].slice(0, MAX_EVIDENCE * 2);
  if (!ids.length) return [];
  const rows = await prisma.evidence.findMany({
    where: { id: { in: ids } },
    select: { id: true, source: true, evidenceType: true, evidenceText: true, sourceUrl: true },
  });
  return rows
    .map((r) => ({ ...r, similarity: sim.get(r.id) ?? 0 }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_EVIDENCE);
}
