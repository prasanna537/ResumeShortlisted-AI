import { z } from "zod";
import type { EvidenceDraft } from "../github/evidence";
import type { LeetCodeDataProvider, NormalizedLeetCodeProfile } from "./provider";

export const leetCodeSchema = z.object({
  username: z.string().max(100),
  problemsSolved: z.number().int().min(0).max(10000).optional(),
  languages: z.array(z.string().max(50)).max(30).default([]),
  categories: z.array(z.string().max(80)).max(60).default([]),
});

/**
 * Candidate-provided LeetCode summary. LeetCode has no official public API, so no scraping is attempted;
 * an approved integration can implement LeetCodeDataProvider later.
 */
export const candidateProvidedLeetCode: LeetCodeDataProvider = {
  origin: "CANDIDATE_PROVIDED",
  async getProfile({ exportData }) {
    return exportData ? (leetCodeSchema.parse(exportData) satisfies NormalizedLeetCodeProfile) : null;
  },
};

export function leetCodeEvidence(p: NormalizedLeetCodeProfile, url: string | null): EvidenceDraft {
  // Counts are context only: they say nothing on their own about professional competence.
  return {
    source: "LEETCODE",
    sourceUrl: url,
    evidenceType: "practice_activity",
    evidenceText:
      `LeetCode practice profile (${p.username}): ${p.problemsSolved ?? "unknown"} problems solved. ` +
      (p.languages.length ? `Languages: ${p.languages.join(", ")}. ` : "") +
      (p.categories.length ? `Topics practiced: ${p.categories.join(", ")}.` : ""),
    metadata: { skills: [], problemsSolved: p.problemsSolved ?? null, practiceOnly: true },
  };
}
