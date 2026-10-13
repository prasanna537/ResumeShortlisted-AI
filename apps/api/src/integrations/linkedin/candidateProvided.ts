import { z } from "zod";
import { detectSkills } from "../../services/skillDetection";
import type { EvidenceDraft } from "../github/evidence";
import type { LinkedInDataProvider, NormalizedLinkedInProfile } from "./provider";

export const linkedInExportSchema = z.object({
  headline: z.string().max(500).default(""),
  skills: z.array(z.string().max(100)).max(200).default([]),
  experience: z
    .array(
      z.object({
        title: z.string().max(200),
        company: z.string().max(200).optional(),
        start: z.string().max(40).optional(),
        end: z.string().max(40).optional(),
        description: z.string().max(3000).optional(),
      }),
    )
    .max(50)
    .default([]),
  education: z
    .array(z.object({ school: z.string().max(200), degree: z.string().max(200).optional(), field: z.string().max(200).optional() }))
    .max(20)
    .default([]),
  projects: z.array(z.object({ name: z.string().max(200), description: z.string().max(3000).optional() })).max(50).default([]),
});

/**
 * Candidate-provided LinkedIn data (pasted or exported by the candidate). No scraping, no login automation.
 * A future authorized-API provider can implement LinkedInDataProvider and be swapped in without engine changes.
 */
export const candidateProvidedLinkedIn: LinkedInDataProvider = {
  origin: "CANDIDATE_PROVIDED",
  async getProfile({ exportData }) {
    if (!exportData) return null;
    return linkedInExportSchema.parse(exportData) satisfies NormalizedLinkedInProfile;
  },
};

export function linkedInEvidence(p: NormalizedLinkedInProfile, profileUrl: string | null): EvidenceDraft[] {
  const url = profileUrl;
  const out: EvidenceDraft[] = [];
  if (p.headline) {
    out.push({ source: "LINKEDIN", sourceUrl: url, evidenceType: "headline", evidenceText: `LinkedIn headline: ${p.headline}`, metadata: { skills: detectSkills(p.headline) } });
  }
  if (p.skills.length) {
    out.push({ source: "LINKEDIN", sourceUrl: url, evidenceType: "skills_list", evidenceText: `LinkedIn listed skills: ${p.skills.join(", ")}`, metadata: { skills: detectSkills(p.skills.join(" , ")) } });
  }
  for (const e of p.experience) {
    const text = `LinkedIn experience: ${e.title}${e.company ? ` at ${e.company}` : ""}${e.start ? ` (${e.start} - ${e.end ?? "present"})` : ""}. ${e.description ?? ""}`.trim();
    out.push({ source: "LINKEDIN", sourceUrl: url, evidenceType: "experience", evidenceText: text, metadata: { skills: detectSkills(text), start: e.start, end: e.end } });
  }
  for (const e of p.education) {
    out.push({ source: "LINKEDIN", sourceUrl: url, evidenceType: "education", evidenceText: `LinkedIn education: ${[e.degree, e.field].filter(Boolean).join(" in ")} at ${e.school}`, metadata: { skills: [] } });
  }
  for (const pr of p.projects) {
    const text = `LinkedIn project: ${pr.name}. ${pr.description ?? ""}`.trim();
    out.push({ source: "LINKEDIN", sourceUrl: url, evidenceType: "project", evidenceText: text, metadata: { skills: detectSkills(text) } });
  }
  return out;
}
