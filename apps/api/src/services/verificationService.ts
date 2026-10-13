import { prisma } from "../lib/prisma";
import { AiError, generateStructured } from "../ai/gemini";
import { batchVerificationPrompt, PROMPT_VERSION, SAFETY } from "../ai/prompts";
import { batchVerdictSchema } from "../ai/schemas";
import { loadEnv } from "../config/env";
import { retrieveEvidenceForClaim, type RetrievedEvidence } from "./retrievalService";
import type { Verdict } from "./matchingEngine";

export interface VerdictOut {
  verdict: Verdict;
  confidence: number;
  reason: string;
  evidenceIds: string[];
}

/**
 * Code-side guardrails on the model output. Never trusts the LLM blindly:
 *  - cited ids must come from the evidence retrieved for that claim
 *  - VERIFIED/PARTIAL need independent (non-resume) evidence; the resume cannot verify itself
 *  - no cited evidence => UNVERIFIED (absence of evidence is not contradiction)
 */
export function guardVerdict(raw: VerdictOut, retrieved: Pick<RetrievedEvidence, "id" | "source">[]): VerdictOut {
  const known = new Map(retrieved.map((e) => [e.id, e]));
  const ids = [...new Set(raw.evidenceIds.filter((id) => known.has(id)))];
  const confidence = Math.min(1, Math.max(0, raw.confidence));
  const independent = ids.filter((id) => known.get(id)!.source !== "RESUME");

  if ((raw.verdict === "VERIFIED" || raw.verdict === "PARTIAL") && independent.length === 0) {
    return {
      verdict: "UNVERIFIED",
      confidence: Math.min(confidence, 0.5),
      reason:
        ids.length === 0
          ? "No independent supporting evidence was found. This does not mean the claim is false."
          : "Only the resume itself mentions this; it is self-reported and not independently verified.",
      evidenceIds: ids,
    };
  }
  if (raw.verdict === "CONTRADICTED" && ids.length === 0) {
    return { verdict: "UNVERIFIED", confidence: Math.min(confidence, 0.5), reason: "A conflict was suggested but no evidence was cited, so the claim is left unverified.", evidenceIds: [] };
  }
  if (raw.verdict === "UNVERIFIED") return { ...raw, confidence, evidenceIds: ids };
  return { verdict: raw.verdict, confidence, reason: raw.reason, evidenceIds: ids };
}

const NO_EVIDENCE: VerdictOut = {
  verdict: "UNVERIFIED",
  confidence: 0.3,
  reason: "No relevant evidence was collected for this claim. This does not mean the claim is false.",
  evidenceIds: [],
};

export interface ClaimToVerify {
  id: string;
  claimText: string;
  evidence: RetrievedEvidence[];
}

const BATCH_SIZE = 8;

/**
 * Verifies claims in batches (one LLM call per ~8 claims) to stay within provider rate limits.
 * Claims without any retrieved evidence skip the LLM entirely. Returns claimId -> verdict.
 */
export async function verifyBatch(claims: ClaimToVerify[]): Promise<Map<string, VerdictOut>> {
  const out = new Map<string, VerdictOut>();
  const withEvidence = claims.filter((c) => c.evidence.length > 0);
  for (const c of claims) if (!c.evidence.length) out.set(c.id, NO_EVIDENCE);

  for (let i = 0; i < withEvidence.length; i += BATCH_SIZE) {
    const batch = withEvidence.slice(i, i + BATCH_SIZE);
    const pool = new Map<string, RetrievedEvidence>();
    for (const c of batch) for (const e of c.evidence) pool.set(e.id, e);
    const res = await generateStructured(
      batchVerdictSchema,
      batchVerificationPrompt(
        batch.map((c) => ({ claimId: c.id, claim: c.claimText, candidateEvidenceIds: c.evidence.map((e) => e.id) })),
        [...pool.values()].map((e) => ({ id: e.id, source: e.source, type: e.evidenceType, text: e.evidenceText.slice(0, 700), url: e.sourceUrl })),
      ),
      SAFETY,
    );
    const byId = new Map(res.results.map((r) => [r.claimId, r]));
    for (const c of batch) {
      const r = byId.get(c.id);
      out.set(
        c.id,
        r
          ? guardVerdict(r, c.evidence)
          : { verdict: "UNVERIFIED", confidence: 0.2, reason: "The automated check did not return a result for this claim.", evidenceIds: [] },
      );
    }
  }
  return out;
}

/** Verifies every claim of a candidate and stores results with their cited evidence. Returns warnings. */
export async function verifyCandidateClaims(candidateId: string): Promise<string[]> {
  const claims = await prisma.resumeClaim.findMany({ where: { candidateId } });
  const warnings: string[] = [];

  const prepared: ClaimToVerify[] = [];
  for (const c of claims) {
    prepared.push({ id: c.id, claimText: c.claimText, evidence: await retrieveEvidenceForClaim(candidateId, c.id, c.canonicalSkill) });
  }

  let results: Map<string, VerdictOut>;
  try {
    results = await verifyBatch(prepared);
  } catch (e) {
    if (e instanceof AiError && e.code === "AI_RATE_LIMIT") throw e;
    throw e instanceof AiError ? e : new AiError("Claim verification failed. Please retry.");
  }

  await prisma.verificationResult.deleteMany({ where: { candidateId } });
  const sim = (c: ClaimToVerify) => new Map(c.evidence.map((e) => [e.id, e.similarity]));
  for (const c of prepared) {
    const out = results.get(c.id)!;
    const s = sim(c);
    await prisma.verificationResult.create({
      data: {
        candidateId,
        claimId: c.id,
        verdict: out.verdict,
        confidence: out.confidence,
        reason: out.reason,
        model: loadEnv().GEMINI_MODEL,
        promptVersion: PROMPT_VERSION,
        evidence: { create: out.evidenceIds.map((id) => ({ evidenceId: id, similarity: s.get(id) ?? null })) },
      },
    });
  }
  return warnings;
}
