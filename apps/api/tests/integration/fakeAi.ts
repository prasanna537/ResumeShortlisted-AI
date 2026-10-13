import type { ZodTypeAny } from "zod";
import { batchVerdictSchema, claimsSchema, explanationSchema, jdSchema, projectRelevanceSchema, resumeSchema } from "../../src/ai/schemas";
import { GithubError, parseGithubUsername } from "../../src/integrations/github/client";
import { detectSkills } from "../../src/services/skillDetection";
import { canonicalSkill } from "../../src/services/skillNormalizer";
import { candidates, sampleJd } from "../fixtures/candidates";

const STOP = new Set(["candidate", "at", "from", "to", "the", "a", "an", "and", "of", "in", "used", "for", "with", "has", "as"]);

/** Deterministic 768-d bag-of-words embedding: related texts share tokens, so cosine similarity is meaningful. */
export function fakeEmbed(text: string): number[] {
  const v = new Array(768).fill(0);
  for (const tok of text.toLowerCase().split(/[^a-z0-9.+#]+/).map((t) => t.replace(/\.+$/, "")).filter((t) => t && !STOP.has(t))) {
    let h = 0;
    for (const ch of tok) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    v[h % 768] += 1;
  }
  const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / n);
}

export const fakeEmbedAll = (texts: string[]) => texts.map(fakeEmbed);

const between = (s: string, a: string, b: string) => s.slice(s.indexOf(a) + a.length, s.indexOf(b));

/** Stands in for the LLM: returns what a well-behaved model would return for each prompt type. */
export async function fakeStructured(schema: ZodTypeAny, prompt: string, key: string): Promise<unknown> {
  const fx = candidates.find((c) => c.key === key)!;
  if (schema === jdSchema) return jdSchema.parse(sampleJd.parsed);
  if (schema === resumeSchema) return resumeSchema.parse(fx.resume);
  if (schema === claimsSchema) {
    return claimsSchema.parse({
      claims: fx.claims.map((c) => ({ claimText: c.claimText, category: c.category, sourceLocation: c.sourceLocation, skill: c.skill, confidence: c.confidence })),
    });
  }
  if (schema === batchVerdictSchema) {
    const claims = JSON.parse(between(prompt, "<claims>", "</claims>")) as { claimId: string; claim: string; candidateEvidenceIds: string[] }[];
    const evidence = JSON.parse(between(prompt, "<evidence>", "</evidence>")) as { id: string; source: string; text: string }[];
    return batchVerdictSchema.parse({
      results: claims.map((c) => {
        const mine = evidence.filter((e) => c.candidateEvidenceIds.includes(e.id));
        const claim = fx.claims.find((x) => x.claimText === c.claim)!;
        const canon = claim.skill ? canonicalSkill(claim.skill) : null;
        const independent = mine.filter((e) => e.source !== "RESUME");
        const mentions = (e: { text: string }) => (canon ? detectSkills(e.text).includes(canon) : true);
        let ids: string[] = [];
        if (claim.mockVerdict === "VERIFIED" || claim.mockVerdict === "PARTIAL") ids = independent.filter(mentions).slice(0, 2).map((e) => e.id);
        else if (claim.mockVerdict === "CONTRADICTED") ids = mine.slice(0, 1).map((e) => e.id);
        return { claimId: c.claimId, verdict: claim.mockVerdict, confidence: 0.8, reason: `Fake model verdict: ${claim.mockVerdict}.`, evidenceIds: ids };
      }),
    });
  }
  if (schema === projectRelevanceSchema) {
    const reqs = (JSON.parse(between(prompt, "<requirements>", "</requirements>")) as string[]).map(canonicalSkill);
    const projects = JSON.parse(between(prompt, "<projects>", "</projects>")) as { name: string; description: string; technologies: string[] }[];
    return projectRelevanceSchema.parse({
      projects: projects.map((p) => {
        const skills = [...p.technologies.map(canonicalSkill), ...detectSkills(p.description)];
        const hit = reqs.filter((r) => skills.includes(r)).length / (reqs.length || 1);
        return { name: p.name, relevance: hit >= 0.5 ? "HIGH" : hit > 0 ? "LOW" : "NONE", reason: "fake" };
      }),
    });
  }
  if (schema === explanationSchema) return explanationSchema.parse({ explanation: "Fake explanation based on the computed figures." });
  throw new Error("fakeStructured: unknown schema");
}

export async function fakeCollect(url: string) {
  const username = parseGithubUsername(url);
  const fx = candidates.find((c) => c.github?.user.login === username);
  if (!fx?.github) throw new GithubError("NOT_FOUND", "GitHub user or resource not found.");
  return { username, user: fx.github.user, repos: fx.github.repos, warnings: [] as string[] };
}
