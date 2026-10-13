import { detectSkills } from "../../services/skillDetection";
import { canonicalSkill } from "../../services/skillNormalizer";
import type { CollectedRepo, GhUser } from "./collector";

export interface EvidenceDraft {
  source: "GITHUB" | "LINKEDIN" | "LEETCODE" | "RESUME";
  sourceUrl: string | null;
  evidenceType: string;
  evidenceText: string;
  metadata: Record<string, unknown>;
  repoName?: string;
}

/** Pure: turns one collected repo into a normalized evidence item. */
export function repoEvidence(c: CollectedRepo): EvidenceDraft {
  const { repo, languages, readmeExcerpt } = c;
  const total = Object.values(languages).reduce((a, b) => a + b, 0) || 1;
  const langList = Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .map(([l, b]) => `${l} (${Math.round((b / total) * 100)}%)`);
  const topics = repo.topics ?? [];
  const readme = (readmeExcerpt ?? "").replace(/\s+/g, " ").slice(0, 700);
  const text =
    `GitHub repository "${repo.name}". ` +
    (repo.description ? `Description: ${repo.description}. ` : "") +
    (langList.length ? `Languages: ${langList.join(", ")}. ` : "") +
    (topics.length ? `Topics: ${topics.join(", ")}. ` : "") +
    (readme ? `README: ${readme}` : "No README found.");
  const skills = [
    ...new Set([
      ...Object.keys(languages).map(canonicalSkill),
      ...topics.map(canonicalSkill),
      ...detectSkills(`${repo.name} ${repo.description ?? ""} ${topics.join(" ")} ${readmeExcerpt ?? ""}`),
    ]),
  ];
  return {
    source: "GITHUB",
    sourceUrl: repo.html_url,
    evidenceType: "repository",
    evidenceText: text,
    repoName: repo.name,
    metadata: { skills, languages, topics, createdAt: repo.created_at, pushedAt: repo.pushed_at, repo: repo.name },
  };
}

export function profileEvidence(user: GhUser, repos: CollectedRepo[]): EvidenceDraft[] {
  const out: EvidenceDraft[] = [];
  if (user.bio) {
    out.push({
      source: "GITHUB",
      sourceUrl: user.html_url,
      evidenceType: "profile_bio",
      evidenceText: `GitHub profile bio: ${user.bio}`,
      metadata: { skills: detectSkills(user.bio) },
    });
  }
  if (repos.length) {
    const created = repos.map((r) => r.repo.created_at).sort();
    const pushed = repos.map((r) => r.repo.pushed_at).sort();
    // Activity span only shows when public work happened; it is not proof of employment duration.
    out.push({
      source: "GITHUB",
      sourceUrl: user.html_url,
      evidenceType: "activity_signal",
      evidenceText:
        `GitHub public activity: ${repos.length} original public repositories analyzed; ` +
        `earliest repository created ${created[0].slice(0, 10)}, most recent push ${pushed[pushed.length - 1].slice(0, 10)}.`,
      metadata: { skills: [], firstCreated: created[0], lastPush: pushed[pushed.length - 1], repoCount: repos.length },
    });
  }
  return out;
}
