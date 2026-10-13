const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Parses "Jan 2022", "01/2022", "2022", "Present" into a month index (year*12+month). */
export function parseMonth(raw: string | null | undefined, now = new Date()): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (/^(present|current|now|ongoing|till date|to date)$/.test(s)) return now.getFullYear() * 12 + now.getMonth();
  const year = s.match(/(19|20)\d{2}/);
  if (!year) return null;
  const y = parseInt(year[0], 10);
  const mName = MONTHS.findIndex((m) => s.includes(m));
  const mNum = s.match(/(?:^|\D)(0?[1-9]|1[0-2])[\/.-](?:19|20)\d{2}/);
  const m = mName >= 0 ? mName : mNum ? parseInt(mNum[1], 10) - 1 : 0;
  return y * 12 + m;
}

/** Total years covered by the union of date ranges (overlaps counted once). */
export function claimedYears(ranges: { start?: string | null; end?: string | null }[], now = new Date()): number {
  const spans = ranges
    .map((r) => [parseMonth(r.start, now), parseMonth(r.end ?? "present", now)] as const)
    .filter((r): r is readonly [number, number] => r[0] !== null && r[1] !== null && r[1] >= r[0])
    .sort((a, b) => a[0] - b[0]);
  let months = 0;
  let curS = -1;
  let curE = -1;
  for (const [s, e] of spans) {
    if (curS < 0) [curS, curE] = [s, e];
    else if (s <= curE) curE = Math.max(curE, e);
    else {
      months += curE - curS;
      [curS, curE] = [s, e];
    }
  }
  if (curS >= 0) months += curE - curS;
  return Math.round((months / 12) * 10) / 10;
}
