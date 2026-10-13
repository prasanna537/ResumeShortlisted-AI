import { geminiEmbeddings } from "../ai/gemini";

/** canonical -> aliases (all matching is done on the cleaned lowercase form). */
export const CANON: Record<string, string[]> = {
  react: ["react", "react.js", "reactjs", "react js"],
  nodejs: ["node", "node.js", "nodejs", "node js"],
  mongodb: ["mongo", "mongodb", "mongo db"],
  expressjs: ["express", "express.js", "expressjs"],
  python: ["python", "python 3", "python3", "py"],
  javascript: ["javascript", "js", "ecmascript", "es6"],
  typescript: ["typescript", "ts"],
  java: ["java"],
  nextjs: ["next", "next.js", "nextjs"],
  vue: ["vue", "vue.js", "vuejs"],
  angular: ["angular", "angularjs", "angular.js"],
  postgresql: ["postgres", "postgresql", "psql", "postgre sql"],
  mysql: ["mysql"],
  redis: ["redis"],
  aws: ["aws", "amazon web services", "amazon aws"],
  azure: ["azure", "microsoft azure"],
  gcp: ["gcp", "google cloud", "google cloud platform"],
  docker: ["docker", "containerization"],
  kubernetes: ["kubernetes", "k8s"],
  git: ["git"],
  html: ["html", "html5"],
  css: ["css", "css3"],
  tailwindcss: ["tailwind", "tailwindcss", "tailwind css"],
  restapi: ["rest", "rest api", "restful", "restful api", "rest apis", "restful apis"],
  graphql: ["graphql"],
  sql: ["sql"],
  cpp: ["c++", "cpp"],
  csharp: ["c#", "csharp"],
  go: ["go", "golang"],
  rust: ["rust"],
  django: ["django"],
  flask: ["flask"],
  spring: ["spring", "spring boot", "springboot"],
  machinelearning: ["machine learning", "ml"],
  tensorflow: ["tensorflow"],
  pytorch: ["pytorch"],
  cicd: ["ci/cd", "cicd", "ci cd"],
  linux: ["linux"],
  firebase: ["firebase"],
  prisma: ["prisma"],
};

const ALIAS = new Map<string, string>();
for (const [canon, aliases] of Object.entries(CANON)) {
  ALIAS.set(canon, canon);
  for (const a of aliases) ALIAS.set(a, canon);
}

const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Exact / alias match against the canonical dictionary. Returns null when the skill is unknown. */
export function normalizeSkillExact(raw: string): string | null {
  const c = clean(raw);
  return ALIAS.get(c) ?? ALIAS.get(c.replace(/[.\s-]/g, "")) ?? null;
}

/** Canonical name, or a stable slug for skills that are not in the dictionary. */
export function canonicalSkill(raw: string): string {
  return normalizeSkillExact(raw) ?? (clean(raw).replace(/[^a-z0-9+#]+/g, "") || clean(raw));
}

export function isKnownSkill(raw: string) {
  return normalizeSkillExact(raw) !== null;
}

export const knownCanonicalSkills = () => Object.keys(CANON);

// ---- semantic fallback -------------------------------------------------------

const cosine = (a: number[], b: number[]) => {
  let d = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return d / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

/**
 * Normalizes an unknown skill by embedding similarity to dictionary entries.
 * Used only as a fallback; the dictionary is the main path. Small dictionary-side comparison
 * (not claim/evidence retrieval, which lives in pgvector).
 */
export async function normalizeSkillSemantic(raw: string, threshold = 0.82): Promise<string> {
  const exact = normalizeSkillExact(raw);
  if (exact) return exact;
  try {
    const canonical = knownCanonicalSkills();
    const [q, ...refs] = await geminiEmbeddings.embed([raw, ...canonical], "SEMANTIC_SIMILARITY");
    let best = { name: "", s: 0 };
    refs.forEach((r, i) => {
      const s = cosine(q, r);
      if (s > best.s) best = { name: canonical[i], s };
    });
    if (best.s >= threshold) return best.name;
  } catch {
    /* embedding unavailable: fall back to slug */
  }
  return canonicalSkill(raw);
}
