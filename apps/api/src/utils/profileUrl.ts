export type ProfileProvider = "GITHUB" | "LINKEDIN" | "LEETCODE";

export class InvalidProfileUrlError extends Error {}

export interface NormalizedProfile {
  /** Canonical HTTPS URL, safe to store and to hand to provider code. */
  url: string;
  username: string;
}

const GITHUB_USER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const LINKEDIN_SLUG = /^[\p{L}\p{N}_%.-]{3,100}$/u;
const LEETCODE_USER = /^[A-Za-z0-9_-]{1,40}$/;

/** Parses a candidate-supplied URL that may lack a scheme ("github.com/x"), "www.", trailing slashes, queries or punctuation. */
function parse(raw: string): URL {
  // Resume text often drags in wrapping punctuation or trailing sentence punctuation.
  let s = raw.trim().replace(/^[<(\[“"']+/, "").replace(/[>)\]”"'.,;:]+$/, "");
  if (!s) throw new InvalidProfileUrlError("URL is empty.");
  const scheme = s.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (scheme) {
    if (!["http", "https"].includes(scheme[1].toLowerCase())) throw new InvalidProfileUrlError("Only http(s) links are accepted.");
  } else {
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/]+\.[^/]+(:\d+)?(\/|$)/.test(s)) throw new InvalidProfileUrlError("Not a web link.");
    s = `https://${s.replace(/^\/\//, "")}`;
  }
  try {
    return new URL(s);
  } catch {
    throw new InvalidProfileUrlError("Not a valid URL.");
  }
}

const host = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, "");
const segments = (u: URL) => u.pathname.split("/").filter(Boolean);
const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * Accepts a profile URL with or without protocol / "www." and returns the canonical HTTPS form.
 * Only the expected provider hosts are accepted, so the server never follows arbitrary links.
 * @throws InvalidProfileUrlError
 */
export function normalizeProfileUrl(provider: ProfileProvider, raw: string): NormalizedProfile {
  const u = parse(raw);
  const h = host(u);
  const seg = segments(u);

  if (provider === "GITHUB") {
    if (h !== "github.com") throw new InvalidProfileUrlError("Expected a github.com profile URL.");
    const user = seg[0];
    if (!user || !GITHUB_USER.test(user)) throw new InvalidProfileUrlError("Expected a URL like github.com/username.");
    return { url: `https://github.com/${user}`, username: user };
  }

  if (provider === "LINKEDIN") {
    // linkedin.com or a country subdomain (in.linkedin.com, uk.linkedin.com ...)
    if (h !== "linkedin.com" && !h.endsWith(".linkedin.com")) throw new InvalidProfileUrlError("Expected a linkedin.com profile URL.");
    if (seg[0] !== "in" || !seg[1]) throw new InvalidProfileUrlError("Expected a URL like linkedin.com/in/username.");
    const slug = decode(seg[1]);
    if (!LINKEDIN_SLUG.test(slug)) throw new InvalidProfileUrlError("Invalid LinkedIn profile name.");
    return { url: `https://www.linkedin.com/in/${encodeURIComponent(slug)}`, username: slug };
  }

  if (h !== "leetcode.com") throw new InvalidProfileUrlError("Expected a leetcode.com profile URL.");
  const user = seg[0] === "u" ? seg[1] : seg[0];
  if (!user || !LEETCODE_USER.test(user)) throw new InvalidProfileUrlError("Expected a URL like leetcode.com/u/username.");
  return { url: `https://leetcode.com/u/${user}`, username: user };
}

const FINDERS: Record<ProfileProvider, RegExp> = {
  GITHUB: /(?<![\w.-])(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9][A-Za-z0-9-]{0,38}/i,
  LINKEDIN: /(?<![\w.-])(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/in\/[^\s)\]>,;"'<]+/i,
  LEETCODE: /(?<![\w.-])(?:https?:\/\/)?(?:www\.)?leetcode\.com\/(?:u\/)?[A-Za-z0-9_-]+/i,
};

/** Fallback for when AI extraction misses a link: finds the first profile URL of a provider in raw resume text. */
export function findProfileUrl(provider: ProfileProvider, text: string): string | null {
  const m = text.match(FINDERS[provider]);
  if (!m) return null;
  try {
    return normalizeProfileUrl(provider, m[0]).url;
  } catch {
    return null;
  }
}
