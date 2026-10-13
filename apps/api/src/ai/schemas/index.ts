import { z } from "zod";

const strArr = z.array(z.string()).default([]);
const nullableStr = z.string().nullish().transform((v) => (v && v.trim() ? v.trim() : null));

export const jdSchema = z.object({
  requiredSkills: strArr,
  preferredSkills: strArr,
  experience: z.object({ minimumYears: z.number().nullish().transform((v) => v ?? null) }).default({ minimumYears: null }),
  education: nullableStr,
  responsibilities: strArr,
  keywords: strArr,
});
export type ParsedJd = z.infer<typeof jdSchema>;

export const resumeSchema = z.object({
  name: nullableStr,
  email: nullableStr,
  phone: nullableStr,
  skills: strArr,
  experience: z
    .array(
      z.object({
        title: z.string().default(""),
        company: nullableStr,
        startDate: nullableStr,
        endDate: nullableStr,
        description: z.string().default(""),
      }),
    )
    .default([]),
  education: z
    .array(z.object({ institution: z.string().default(""), degree: nullableStr, field: nullableStr, year: nullableStr }))
    .default([]),
  projects: z
    .array(z.object({ name: z.string().default(""), description: z.string().default(""), technologies: strArr }))
    .default([]),
  certifications: strArr,
  githubUrl: nullableStr,
  linkedinUrl: nullableStr,
  leetcodeUrl: nullableStr,
});
export type ParsedResume = z.infer<typeof resumeSchema>;

export const claimsSchema = z.object({
  claims: z
    .array(
      z.object({
        claimText: z.string().min(3),
        category: z.enum(["SKILL", "EXPERIENCE", "PROJECT", "EDUCATION", "CERTIFICATION", "OTHER"]).catch("OTHER"),
        sourceLocation: z.string().nullish(),
        skill: z.string().nullish(),
        confidence: z.number().min(0).max(1).catch(0.5),
      }),
    )
    .default([]),
});

export const verdictSchema = z.object({
  verdict: z.enum(["VERIFIED", "PARTIAL", "UNVERIFIED", "CONTRADICTED"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  evidenceIds: z.array(z.string()).default([]),
});

export const batchVerdictSchema = z.object({ results: z.array(verdictSchema.extend({ claimId: z.string() })).default([]) });

export const projectRelevanceSchema = z.object({
  projects: z
    .array(
      z.object({
        name: z.string(),
        relevance: z.enum(["HIGH", "MEDIUM", "LOW", "NONE"]).catch("NONE"),
        reason: z.string().default(""),
      }),
    )
    .default([]),
});

export const explanationSchema = z.object({ explanation: z.string().min(1) });
