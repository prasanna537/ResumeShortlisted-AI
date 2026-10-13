import { githubGet, GithubError, parseGithubUsername } from "./client";
import { loadEnv } from "../../config/env";

export interface GhUser {
  login: string;
  name: string | null;
  bio: string | null;
  public_repos: number;
  followers: number;
  created_at: string;
  html_url: string;
}
export interface GhRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  topics?: string[];
  fork: boolean;
  language: string | null;
  created_at: string;
  pushed_at: string;
  updated_at: string;
  size: number;
  [k: string]: unknown;
}
export interface CollectedRepo {
  repo: GhRepo;
  languages: Record<string, number>;
  readmeExcerpt: string | null;
}
export interface GithubCollection {
  username: string;
  user: GhUser;
  repos: CollectedRepo[];
  warnings: string[];
}

const MAX_REPOS = 25;
const README_CHARS = 3000;

async function readme(fullName: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${fullName}/readme`, {
      headers: {
        Authorization: `Bearer ${loadEnv().GITHUB_TOKEN}`,
        Accept: "application/vnd.github.raw+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, README_CHARS);
  } catch {
    return null;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/** Collects public profile + repo data from the official GitHub REST API. */
export async function collectGithub(profileUrl: string): Promise<GithubCollection> {
  const username = parseGithubUsername(profileUrl);
  const warnings: string[] = [];
  const user = await githubGet<GhUser>(`/users/${username}`);

  let repos: GhRepo[] = [];
  try {
    repos = await githubGet<GhRepo[]>(`/users/${username}/repos?per_page=100&sort=pushed&type=owner`);
  } catch (e) {
    if (e instanceof GithubError && e.code === "RATE_LIMIT") throw e;
    warnings.push("Repository list could not be retrieved.");
  }
  if (!repos.length) warnings.push("No public repositories were found for this GitHub profile.");

  // Original work first; forks carry little evidence of the candidate's own work.
  const own = repos.filter((r) => !r.fork).slice(0, MAX_REPOS);
  const collected = await mapLimit(own, 5, async (repo): Promise<CollectedRepo> => {
    let languages: Record<string, number> = {};
    try {
      languages = await githubGet<Record<string, number>>(`/repos/${repo.full_name}/languages`);
    } catch (e) {
      if (e instanceof GithubError && e.code === "RATE_LIMIT") warnings.push("GitHub rate limit reached; some repository details are missing.");
    }
    return { repo, languages, readmeExcerpt: await readme(repo.full_name) };
  });
  return { username, user, repos: collected, warnings: [...new Set(warnings)] };
}
