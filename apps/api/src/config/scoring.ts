/** Global scoring configuration. Weights sum to 1. The LLM never produces numeric scores. */
export const WEIGHTS = {
  requiredSkill: 0.4,
  verifiedExperience: 0.2,
  projectRelevance: 0.15,
  technicalEvidence: 0.15,
  consistency: 0.1,
} as const;
export type Weights = Record<keyof typeof WEIGHTS, number>;

/** Credit given to a claim by verdict. UNVERIFIED gets partial credit because missing evidence is not proof of falsehood. */
export const VERDICT_VALUE = { VERIFIED: 1, PARTIAL: 0.65, UNVERIFIED: 0.3, CONTRADICTED: 0 } as const;

export const RELEVANCE_VALUE = { HIGH: 1, MEDIUM: 0.65, LOW: 0.3, NONE: 0 } as const;

/** Skill evident in external evidence but never claimed on the resume. */
export const UNCLAIMED_EVIDENCED_VALUE = 0.6;

/** Preferred skills contribute this share of the skill-match component. */
export const PREFERRED_SHARE = 0.15;

/** Minimum cosine similarity for a semantic requirement-to-claim match. */
export const SEMANTIC_MATCH_THRESHOLD = 0.8;
