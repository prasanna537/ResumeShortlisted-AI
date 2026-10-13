import { CANON } from "./skillNormalizer";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Aliases of 1-2 characters (js, ts, py, go, ml, c) are too ambiguous to find inside free text.
const PATTERNS: [string, RegExp][] = Object.entries(CANON).map(([canon, aliases]) => {
  const words = [canon, ...aliases].filter((a) => a.length > 2 || /[+#]/.test(a));
  return [canon, new RegExp(`(?<![a-z0-9+#.])(?:${[...new Set(words)].map(esc).join("|")})(?![a-z0-9+#])`, "i")];
});

/** Finds known canonical skills mentioned in free text (README, descriptions, topics). */
export function detectSkills(text: string): string[] {
  const out: string[] = [];
  for (const [canon, re] of PATTERNS) if (re.test(text)) out.push(canon);
  return out;
}
