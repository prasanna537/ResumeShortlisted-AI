import { describe, expect, it } from "vitest";
import { findProfileUrl, InvalidProfileUrlError, normalizeProfileUrl } from "../../src/utils/profileUrl";
import { GithubError, parseGithubUsername } from "../../src/integrations/github/client";

describe("GitHub URL normalization", () => {
  it.each([
    "github.com/prasanna537",
    "https://github.com/prasanna537",
    "http://github.com/prasanna537",
    "www.github.com/prasanna537",
    "https://www.github.com/prasanna537",
    "HTTPS://GitHub.com/prasanna537/",
    "github.com/prasanna537?tab=repositories",
    "github.com/prasanna537/some-repo",
    "  github.com/prasanna537.  ",
    "(github.com/prasanna537)",
  ])("%j -> canonical https://github.com/prasanna537", (raw) => {
    expect(normalizeProfileUrl("GITHUB", raw)).toEqual({ url: "https://github.com/prasanna537", username: "prasanna537" });
  });

  it.each([
    "",
    "not a url",
    "https://evil.com/prasanna537",
    "github.com.evil.com/prasanna537",
    "https://github.com@evil.com/x",
    "https://github.com/",
    "github.com/-bad",
    "ftp://github.com/prasanna537",
    "javascript:alert(1)",
    "https://gist.github.com/prasanna537",
  ])("rejects %j", (raw) => {
    expect(() => normalizeProfileUrl("GITHUB", raw)).toThrow(InvalidProfileUrlError);
  });

  it("parseGithubUsername accepts the same formats and keeps its GithubError contract", () => {
    expect(parseGithubUsername("github.com/prasanna537")).toBe("prasanna537");
    expect(parseGithubUsername("www.github.com/prasanna537")).toBe("prasanna537");
    expect(() => parseGithubUsername("https://evil.com/x")).toThrow(GithubError);
  });
});

describe("LinkedIn URL normalization", () => {
  it.each([
    "linkedin.com/in/prasannasubramani",
    "https://linkedin.com/in/prasannasubramani",
    "www.linkedin.com/in/prasannasubramani",
    "https://www.linkedin.com/in/prasannasubramani",
    "https://www.linkedin.com/in/prasannasubramani/",
    "https://www.linkedin.com/in/prasannasubramani?utm_source=share",
    "in.linkedin.com/in/prasannasubramani",
  ])("%j -> canonical https://www.linkedin.com/in/prasannasubramani", (raw) => {
    expect(normalizeProfileUrl("LINKEDIN", raw)).toEqual({ url: "https://www.linkedin.com/in/prasannasubramani", username: "prasannasubramani" });
  });

  it.each(["linkedin.com/company/acme", "linkedin.com/in/", "linkedin.com", "notlinkedin.com/in/someone", "https://evil.com/in/someone", "linkedin.com/in/a"])(
    "rejects %j",
    (raw) => {
      expect(() => normalizeProfileUrl("LINKEDIN", raw)).toThrow(InvalidProfileUrlError);
    },
  );
});

describe("LeetCode URL normalization", () => {
  it.each(["leetcode.com/prasanna", "https://leetcode.com/u/prasanna/", "www.leetcode.com/u/prasanna"])("%j", (raw) => {
    expect(normalizeProfileUrl("LEETCODE", raw)).toEqual({ url: "https://leetcode.com/u/prasanna", username: "prasanna" });
  });
  it("rejects other hosts", () => {
    expect(() => normalizeProfileUrl("LEETCODE", "evil.com/prasanna")).toThrow(InvalidProfileUrlError);
  });
});

describe("finding profile URLs in raw resume text", () => {
  const text = `Prasanna S | prasanna@example.test | github.com/prasanna537 | linkedin.com/in/prasannasubramani
    Projects: see https://github.com/prasanna537/ecommerce-api for the code. Practice: leetcode.com/prasanna`;
  it("finds protocol-less links and canonicalizes them", () => {
    expect(findProfileUrl("GITHUB", text)).toBe("https://github.com/prasanna537");
    expect(findProfileUrl("LINKEDIN", text)).toBe("https://www.linkedin.com/in/prasannasubramani");
    expect(findProfileUrl("LEETCODE", text)).toBe("https://leetcode.com/u/prasanna");
  });
  it("returns null when absent and ignores look-alike hosts", () => {
    expect(findProfileUrl("GITHUB", "see mygithub.com/x or notgithub.com/y")).toBeNull();
    expect(findProfileUrl("LINKEDIN", "no links here")).toBeNull();
  });
  it("handles a link wrapped in punctuation", () => {
    expect(findProfileUrl("GITHUB", "GitHub: (github.com/prasanna537).")).toBe("https://github.com/prasanna537");
  });
});
