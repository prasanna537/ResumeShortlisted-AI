import { describe, expect, it } from "vitest";
import { WEIGHTS } from "../../src/config/scoring";
import { claimedYears, parseMonth } from "../../src/utils/experience";
import { computeScore, matchRequirements, type ClaimInput, type ReqInput, type Verdict } from "../../src/services/matchingEngine";
import { guardVerdict } from "../../src/services/verificationService";
import { candidates, sampleJd } from "../fixtures/candidates";
import { canonicalSkill } from "../../src/services/skillNormalizer";
import { detectSkills } from "../../src/services/skillDetection";
import { repoEvidence } from "../../src/integrations/github/evidence";

const reqs: ReqInput[] = [
  ...sampleJd.parsed.requiredSkills.map((s, i) => ({ id: `r${i}`, skill: s, canonicalSkill: canonicalSkill(s), kind: "REQUIRED" as const })),
  ...sampleJd.parsed.preferredSkills.map((s, i) => ({ id: `p${i}`, skill: s, canonicalSkill: canonicalSkill(s), kind: "PREFERRED" as const })),
];

/** Builds engine inputs for a fixture candidate straight from its mock verdicts and GitHub fixture. */
function build(key: string) {
  const c = candidates.find((x) => x.key === key)!;
  const claims: ClaimInput[] = c.claims.map((cl, i) => ({
    id: `c${i}`,
    canonicalSkill: cl.skill ? canonicalSkill(cl.skill) : null,
    claimText: cl.claimText,
    category: cl.category,
    sourceLocation: cl.sourceLocation,
    verdict: cl.mockVerdict as Verdict,
    // independent evidence exists only for claims that GitHub fixtures actually mention
    independentEvidenceIds: [],
  }));
  const skillEvidence = new Map<string, string[]>();
  (c.github?.repos ?? []).map(repoEvidence).forEach((e, i) => {
    for (const s of (e.metadata.skills as string[]) ?? []) skillEvidence.set(s, [...(skillEvidence.get(s) ?? []), `e${i}`]);
  });
  const matches = matchRequirements(reqs, claims, skillEvidence);
  const projects = c.resume.projects.map((p) => {
    const overlap = [...new Set([...p.technologies.map(canonicalSkill), ...detectSkills(p.description)])];
    const req = reqs.filter((r) => r.kind === "REQUIRED").map((r) => r.canonicalSkill);
    const hit = req.filter((s) => overlap.includes(s)).length / req.length;
    return { name: p.name, relevance: hit >= 0.5 ? ("HIGH" as const) : hit > 0 ? ("LOW" as const) : ("NONE" as const), verdict: null };
  });
  const years = claimedYears(c.resume.experience.map((e) => ({ start: e.startDate, end: e.endDate })), new Date("2026-10-01"));
  return { c, claims, matches, score: computeScore({ matches, claims, projects, claimedYears: years, requiredYears: 2 }) };
}

describe("experience dates", () => {
  const now = new Date("2026-01-15");
  it("parses common formats", () => {
    expect(parseMonth("Jan 2021", now)).toBe(2021 * 12);
    expect(parseMonth("2021", now)).toBe(2021 * 12);
    expect(parseMonth("Present", now)).toBe(2026 * 12);
    expect(parseMonth("garbage", now)).toBeNull();
  });
  it("counts overlapping ranges once", () => {
    expect(claimedYears([{ start: "2018", end: "2022" }, { start: "2019", end: "2023" }], now)).toBe(5);
    expect(claimedYears([{ start: "2020", end: "2021" }, { start: "2022", end: "2023" }], now)).toBe(2);
  });
});

describe("requirement matching", () => {
  const claim = (verdict: Verdict | null, over: Partial<ClaimInput> = {}): ClaimInput => ({
    id: "c", canonicalSkill: "react", claimText: "Candidate used React.", category: "SKILL", verdict, independentEvidenceIds: [], ...over,
  });
  const r: ReqInput[] = [{ id: "r", skill: "React.js", canonicalSkill: "react", kind: "REQUIRED" }];

  it("matches by canonical skill regardless of spelling", () => {
    expect(matchRequirements(r, [claim("VERIFIED")], new Map())[0].status).toBe("VERIFIED");
  });
  it("missing evidence is NOT_FOUND, never CONTRADICTED", () => {
    expect(matchRequirements(r, [], new Map())[0].status).toBe("NOT_FOUND");
  });
  it("credits independently evidenced but unclaimed skills", () => {
    const m = matchRequirements(r, [], new Map([["react", ["e1"]]]))[0];
    expect(m.status).toBe("EVIDENCE_ONLY");
    expect(m.value).toBeGreaterThan(0);
  });
  it("uses a semantic match only when there is no exact match", () => {
    const sem = new Map([["r", "c2"]]);
    const claims = [claim("PARTIAL", { id: "c2", canonicalSkill: "reactnative" })];
    const m = matchRequirements(r, claims, new Map(), sem)[0];
    expect(m.via).toBe("semantic");
    expect(m.status).toBe("PARTIAL");
  });
  it("an unverified claim gets less credit than a verified one but more than nothing", () => {
    const v = matchRequirements(r, [claim("VERIFIED")], new Map())[0].value;
    const u = matchRequirements(r, [claim("UNVERIFIED")], new Map())[0].value;
    expect(v).toBeGreaterThan(u);
    expect(u).toBeGreaterThan(0);
  });
});

describe("score calculation (deterministic)", () => {
  it("weights sum to 1", () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
  it("is reproducible", () => {
    expect(build("strong").score).toEqual(build("strong").score);
  });
  it("overall is the weighted sum of components", () => {
    const { score } = build("strong");
    const expected =
      100 * (score.components.requiredSkill * 0.4 + score.components.verifiedExperience * 0.2 + score.components.projectRelevance * 0.15 + score.components.technicalEvidence * 0.15 + score.components.consistency * 0.1);
    expect(score.overall).toBeCloseTo(expected, 0);
  });
  it("all components stay within 0..1", () => {
    for (const c of candidates) Object.values(build(c.key).score.components).forEach((v) => expect(v >= 0 && v <= 1).toBe(true));
  });
  it.each(candidates.map((c) => [c.label, c.key, c.expect] as const))("%s matches expectations", (_l, key, exp) => {
    const { score, claims } = build(key);
    if (exp.minOverall !== undefined) expect(score.overall).toBeGreaterThanOrEqual(exp.minOverall);
    if (exp.maxOverall !== undefined) expect(score.overall).toBeLessThanOrEqual(exp.maxOverall);
    expect(claims.filter((c) => c.verdict === "CONTRADICTED").length).toBe(exp.contradicted ?? 0);
  });
  it("ranks the strong candidate above every other fixture", () => {
    const strong = build("strong").score.overall;
    for (const k of ["unsupported", "exaggerated", "missing", "conflict"]) expect(strong).toBeGreaterThan(build(k).score.overall);
  });
  it("unsupported claims lower the score but never zero it", () => {
    const s = build("unsupported").score;
    expect(s.overall).toBeGreaterThan(0);
    expect(s.components.consistency).toBe(1);
  });
  it("contradictions reduce consistency", () => {
    expect(build("conflict").score.components.consistency).toBeLessThan(build("strong").score.components.consistency);
  });
  it("candidate with missing required skills is flagged NOT_FOUND on those skills", () => {
    const { matches } = build("missing");
    expect(matches.filter((m) => m.kind === "REQUIRED").every((m) => m.status === "NOT_FOUND")).toBe(true);
  });
  it("exaggerated years are capped by the requirement ratio and verification factor", () => {
    const { score } = build("exaggerated");
    expect(score.subScores.experienceYearsFactor).toBe(1);
    expect(score.subScores.experienceVerificationFactor).toBeLessThan(1);
  });
});

describe("verdict guardrails", () => {
  const ev = [{ id: "e1", source: "GITHUB" as const }, { id: "e2", source: "RESUME" as const }];
  it("drops evidence ids that were not retrieved", () => {
    const g = guardVerdict({ verdict: "VERIFIED", confidence: 0.9, reason: "x", evidenceIds: ["e1", "ghost"] }, ev);
    expect(g.evidenceIds).toEqual(["e1"]);
    expect(g.verdict).toBe("VERIFIED");
  });
  it("downgrades VERIFIED without any cited evidence", () => {
    expect(guardVerdict({ verdict: "VERIFIED", confidence: 0.9, reason: "x", evidenceIds: [] }, ev).verdict).toBe("UNVERIFIED");
  });
  it("the resume cannot verify itself", () => {
    expect(guardVerdict({ verdict: "VERIFIED", confidence: 0.9, reason: "x", evidenceIds: ["e2"] }, ev).verdict).toBe("UNVERIFIED");
  });
  it("CONTRADICTED needs cited evidence; with it, it is kept", () => {
    expect(guardVerdict({ verdict: "CONTRADICTED", confidence: 0.9, reason: "x", evidenceIds: [] }, ev).verdict).toBe("UNVERIFIED");
    expect(guardVerdict({ verdict: "CONTRADICTED", confidence: 0.9, reason: "x", evidenceIds: ["e1"] }, ev).verdict).toBe("CONTRADICTED");
  });
  it("clamps confidence", () => {
    expect(guardVerdict({ verdict: "PARTIAL", confidence: 4, reason: "x", evidenceIds: ["e1"] }, ev).confidence).toBe(1);
  });
});
