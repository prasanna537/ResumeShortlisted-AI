import { loadEnv } from "../../config/env";
import { InvalidProfileUrlError, normalizeProfileUrl } from "../../utils/profileUrl";

export class GithubError extends Error {
  constructor(public code: "NOT_FOUND" | "RATE_LIMIT" | "API_ERROR" | "INVALID_URL", message: string) {
    super(message);
  }
}

/** Extracts a username from a GitHub profile URL (with or without protocol / "www."; no other hosts accepted). */
export function parseGithubUsername(url: string): string {
  try {
    return normalizeProfileUrl("GITHUB", url).username;
  } catch (e) {
    if (e instanceof InvalidProfileUrlError) throw new GithubError("INVALID_URL", "Expected a URL like github.com/username.");
    throw e;
  }
}

export async function githubGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${loadEnv().GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } catch {
    throw new GithubError("API_ERROR", "GitHub could not be reached.");
  }
  if (res.status === 404) throw new GithubError("NOT_FOUND", "GitHub user or resource not found.");
  if (res.status === 403 || res.status === 429) {
    throw new GithubError("RATE_LIMIT", "GitHub rate limit reached or access denied. Try again later.");
  }
  if (!res.ok) throw new GithubError("API_ERROR", `GitHub API error (${res.status}).`);
  return (await res.json()) as T;
}
