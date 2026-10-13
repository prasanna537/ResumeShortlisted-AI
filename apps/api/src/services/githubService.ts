import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { collectGithub } from "../integrations/github/collector";
import { GithubError } from "../integrations/github/client";
import { profileEvidence, repoEvidence } from "../integrations/github/evidence";
import { storeEvidence } from "./evidenceService";

const j = (v: unknown) => v as Prisma.InputJsonValue;

export interface GithubResult {
  ok: boolean;
  username?: string;
  repositories?: number;
  evidenceItems?: number;
  warnings: string[];
  error?: string;
}

/** User-facing messages; the analysis can continue without GitHub. */
export function githubErrorMessage(e: unknown): string {
  if (e instanceof GithubError) {
    switch (e.code) {
      case "INVALID_URL":
        return "The GitHub URL is not valid. Expected https://github.com/username.";
      case "NOT_FOUND":
        return "GitHub user was not found.";
      case "RATE_LIMIT":
        return "GitHub rate limit reached. Try again later.";
      default:
        return "GitHub data could not be retrieved.";
    }
  }
  return "GitHub data could not be retrieved.";
}

/** Collects GitHub data and stores raw (GithubProfile/GithubRepository) and normalized (Evidence) data. */
export async function collectAndStoreGithub(candidateId: string, url: string, consentGiven: boolean): Promise<GithubResult> {
  try {
    const col = await collectGithub(url);
    const profile = await prisma.$transaction(async (tx) => {
      const ext = await tx.externalProfile.upsert({
        where: { candidateId_provider: { candidateId, provider: "GITHUB" } },
        update: { url, username: col.username, origin: "OFFICIAL_API", consentGiven, collectedAt: new Date(), lastError: null },
        create: { candidateId, provider: "GITHUB", url, username: col.username, origin: "OFFICIAL_API", consentGiven, collectedAt: new Date() },
      });
      await tx.githubProfile.deleteMany({ where: { externalProfileId: ext.id } });
      return tx.githubProfile.create({
        data: {
          externalProfileId: ext.id,
          username: col.user.login,
          name: col.user.name,
          bio: col.user.bio,
          publicRepos: col.user.public_repos,
          followers: col.user.followers,
          accountCreatedAt: new Date(col.user.created_at),
          rawData: j(col.user),
          repositories: {
            create: col.repos.map((c) => ({
              name: c.repo.name,
              url: c.repo.html_url,
              description: c.repo.description,
              languages: j(c.languages),
              topics: c.repo.topics ?? [],
              readmeExcerpt: c.readmeExcerpt,
              isFork: c.repo.fork,
              repoCreatedAt: new Date(c.repo.created_at),
              repoPushedAt: new Date(c.repo.pushed_at),
              rawData: j(c.repo),
            })),
          },
        },
        include: { repositories: true },
      });
    });
    const repoIds = Object.fromEntries(profile.repositories.map((r) => [r.name, r.id]));
    const drafts = [...profileEvidence(col.user, col.repos), ...col.repos.map(repoEvidence)];
    const n = await storeEvidence(candidateId, "GITHUB", drafts, repoIds);
    return { ok: true, username: col.username, repositories: col.repos.length, evidenceItems: n, warnings: col.warnings };
  } catch (e) {
    const error = githubErrorMessage(e);
    await prisma.externalProfile
      .upsert({
        where: { candidateId_provider: { candidateId, provider: "GITHUB" } },
        update: { url, lastError: error },
        create: { candidateId, provider: "GITHUB", url, origin: "OFFICIAL_API", consentGiven, lastError: error },
      })
      .catch(() => undefined);
    return { ok: false, warnings: [], error };
  }
}
