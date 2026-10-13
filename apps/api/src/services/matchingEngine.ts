import {
  PREFERRED_SHARE,
  RELEVANCE_VALUE,
  UNCLAIMED_EVIDENCED_VALUE,
  VERDICT_VALUE,
  WEIGHTS,
  type Weights,
} from "../config/scoring";

/** Pure, deterministic matching and scoring. No LLM output is used as a number anywhere in here. */

export type Verdict = keyof typeof VERDICT_VALUE;
export type MatchStatus = Verdict | "EVIDENCE_ONLY" | "NOT_FOUND";

export interface ReqInput {
  id: string;
  skill: string;
  canonicalSkill: string;
  kind: "REQUIRED" | "PREFERRED";
}
export interface ClaimInput {
  id: string;
  canonicalSkill: string | null;
  claimText: string;
  category: string;
  sourceLocation?: string | null;
  verdict: Verdict | null;
  /** ids of non-resume evidence cited by the verification */
  independentEvidenceIds: string[];
}
export interface RequirementMatch {
  requirementId: string;
  skill: string;
  kind: "REQUIRED" | "PREFERRED";
  status: MatchStatus;
  value: number;
  via: "exact" | "semantic" | "evidence" | null;
  claimId: string | null;
  evidenceIds: string[];
  note: string;
}

const valueOf = (status: MatchStatus) =>
  status === "EVIDENCE_ONLY" ? UNCLAIMED_EVIDENCED_VALUE : status === "NOT_FOUND" ? 0 : VERDICT_VALUE[status];

/**
 * @param skillEvidence canonical skill -> ids of independent (non-resume) evidence mentioning it
 * @param semanticClaim requirementId -> claimId found by pgvector similarity when no exact skill match exists
 */
export function matchRequirements(
  reqs: ReqInput[],
  claims: ClaimInput[],
  skillEvidence: Map<string, string[]>,
  semanticClaim: Map<string, string> = new Map(),
): RequirementMatch[] {
  return reqs.map((r) => {
    const exact = claims.filter((c) => c.canonicalSkill === r.canonicalSkill && c.verdict);
    let pool = exact;
    let via: RequirementMatch["via"] = exact.length ? "exact" : null;
    if (!pool.length && semanticClaim.has(r.id)) {
      pool = claims.filter((c) => c.id === semanticClaim.get(r.id) && c.verdict);
      if (pool.length) via = "semantic";
    }
    const indep = skillEvidence.get(r.canonicalSkill) ?? [];

    if (pool.length) {
      const best = pool.reduce((a, b) => (VERDICT_VALUE[b.verdict!] > VERDICT_VALUE[a.verdict!] ? b : a));
      const evidenceIds = [...new Set([...best.independentEvidenceIds, ...indep])];
      return {
        requirementId: r.id,
        skill: r.skill,
        kind: r.kind,
        status: best.verdict!,
        value: valueOf(best.verdict!),
        via,
        claimId: best.id,
        evidenceIds,
        note:
          via === "semantic"
            ? `Matched semantically to the claim "${best.claimText}".`
            : `Resume claim "${best.claimText}" is ${best.verdict}.`,
      };
    }
    if (indep.length) {
      return {
        requirementId: r.id,
        skill: r.skill,
        kind: r.kind,
        status: "EVIDENCE_ONLY",
        value: valueOf("EVIDENCE_ONLY"),
        via: "evidence",
        claimId: null,
        evidenceIds: indep,
        note: "Not claimed on the resume, but external evidence shows this skill in use.",
      };
    }
    return {
      requirementId: r.id,
      skill: r.skill,
      kind: r.kind,
      status: "NOT_FOUND",
      value: 0,
      via: null,
      claimId: null,
      evidenceIds: [],
      note: "No resume claim or collected evidence for this skill. This does not mean the candidate lacks it.",
    };
  });
}

export interface ProjectInput {
  name: string;
  relevance: keyof typeof RELEVANCE_VALUE;
  /** verdict of the project claim, if one exists */
  verdict: Verdict | null;
}

export interface ScoreInput {
  matches: RequirementMatch[];
  claims: Pick<ClaimInput, "category" | "verdict">[];
  projects: ProjectInput[];
  claimedYears: number;
  requiredYears: number | null;
  weights?: Weights;
}

export interface ScoreResult {
  overall: number; // 0..100
  components: {
    requiredSkill: number;
    verifiedExperience: number;
    projectRelevance: number;
    technicalEvidence: number;
    consistency: number;
  }; // each 0..1
  subScores: { requiredSkillMatch: number; preferredSkillMatch: number | null; experienceYearsFactor: number; experienceVerificationFactor: number };
  weights: Weights;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function computeScore(input: ScoreInput): ScoreResult {
  const w = input.weights ?? { ...WEIGHTS };
  const required = input.matches.filter((m) => m.kind === "REQUIRED");
  const preferred = input.matches.filter((m) => m.kind === "PREFERRED");

  const requiredSkillMatch = avg(required.map((m) => m.value));
  const preferredSkillMatch = preferred.length ? avg(preferred.map((m) => m.value)) : null;
  const requiredSkill =
    required.length === 0
      ? preferredSkillMatch ?? 0
      : preferredSkillMatch === null
        ? requiredSkillMatch
        : (1 - PREFERRED_SHARE) * requiredSkillMatch + PREFERRED_SHARE * preferredSkillMatch;

  // Verified experience = (claimed years vs requirement) x (how well experience claims verified).
  const experienceYearsFactor = input.requiredYears ? Math.min(1, input.claimedYears / input.requiredYears) : 1;
  const expClaims = input.claims.filter((c) => c.category === "EXPERIENCE" && c.verdict);
  const experienceVerificationFactor = expClaims.length ? avg(expClaims.map((c) => VERDICT_VALUE[c.verdict!])) : VERDICT_VALUE.UNVERIFIED;
  const verifiedExperience = experienceYearsFactor * experienceVerificationFactor;

  // Project relevance, scaled by how well the project itself is verified (0.5..1).
  const projectRelevance = avg(
    input.projects.slice(0, 5).map((p) => RELEVANCE_VALUE[p.relevance] * (0.5 + 0.5 * VERDICT_VALUE[p.verdict ?? "UNVERIFIED"])),
  );

  // Technical evidence = share of required skills backed by independent (non-resume) evidence.
  const technicalEvidence = required.length ? required.filter((m) => m.evidenceIds.length > 0).length / required.length : 0;

  const judged = input.claims.filter((c) => c.verdict);
  const contradicted = judged.filter((c) => c.verdict === "CONTRADICTED").length;
  const consistency = judged.length ? Math.max(0, 1 - (2 * contradicted) / judged.length) : 1;

  const components = {
    requiredSkill: r3(requiredSkill),
    verifiedExperience: r3(verifiedExperience),
    projectRelevance: r3(projectRelevance),
    technicalEvidence: r3(technicalEvidence),
    consistency: r3(consistency),
  };
  const overall =
    100 *
    (components.requiredSkill * w.requiredSkill +
      components.verifiedExperience * w.verifiedExperience +
      components.projectRelevance * w.projectRelevance +
      components.technicalEvidence * w.technicalEvidence +
      components.consistency * w.consistency);

  return {
    overall: Math.round(overall * 10) / 10,
    components,
    subScores: {
      requiredSkillMatch: r3(requiredSkillMatch),
      preferredSkillMatch: preferredSkillMatch === null ? null : r3(preferredSkillMatch),
      experienceYearsFactor: r3(experienceYearsFactor),
      experienceVerificationFactor: r3(experienceVerificationFactor),
    },
    weights: w,
  };
}

/** Fallback when the LLM cannot classify projects: overlap between project technologies and required skills. */
export function fallbackRelevance(projectSkills: string[], requiredCanonical: string[]): keyof typeof RELEVANCE_VALUE {
  if (!requiredCanonical.length) return "NONE";
  const hit = requiredCanonical.filter((s) => projectSkills.includes(s)).length / requiredCanonical.length;
  return hit >= 0.5 ? "HIGH" : hit >= 0.25 ? "MEDIUM" : hit > 0 ? "LOW" : "NONE";
}
