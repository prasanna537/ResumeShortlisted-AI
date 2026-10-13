import { describe, expect, it } from "vitest";
import { parseGithubUsername, GithubError } from "../../src/integrations/github/client";
import { profileEvidence, repoEvidence } from "../../src/integrations/github/evidence";
import { candidates } from "../fixtures/candidates";

describe("GitHub URL parsing", () => {
  it("extracts usernames", () => {
    expect(parseGithubUsername("https://github.com/octocat")).toBe("octocat");
    expect(parseGithubUsername("https://github.com/octocat/Hello-World")).toBe("octocat");
    expect(parseGithubUsername("https://www.github.com/octo-cat/")).toBe("octo-cat");
  });
  it.each(["not a url", "https://evil.com/octocat", "https://github.com/", "https://github.com/-bad-", "http://github.com/a b"])(
    "rejects %s",
    (u) => {
      expect(() => parseGithubUsername(u)).toThrow(GithubError);
    },
  );
});

describe("GitHub evidence normalization", () => {
  const strong = candidates[0].github!;
  it("builds a repository evidence item with source, url and detected skills", () => {
    const ev = repoEvidence(strong.repos[0]);
    expect(ev.source).toBe("GITHUB");
    expect(ev.sourceUrl).toContain("github.com");
    expect(ev.evidenceType).toBe("repository");
    expect(ev.evidenceText).toContain("ecommerce-frontend");
    expect((ev.metadata.skills as string[])).toEqual(expect.arrayContaining(["react"]));
  });
  it("does not use stars or followers as evidence", () => {
    const text = [...profileEvidence(strong.user, strong.repos), ...strong.repos.map(repoEvidence)].map((e) => e.evidenceText).join(" ");
    expect(text).not.toMatch(/follower|stars?\b/i);
  });
  it("handles an empty repository list", () => {
    expect(profileEvidence(strong.user, [])).toEqual([]);
  });
});
