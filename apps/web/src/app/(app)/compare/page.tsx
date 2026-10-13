"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { Card, Empty, ErrorBanner, Notice, PageHeader, Spinner, pct } from "@/components/ui";
import { StatusBadge, VerdictSummary } from "@/components/StatusBadge";
import type { Components, MatchStatus, VerdictCounts } from "@/types";

interface Row {
  id: string; name: string | null; job: { id: string; title: string }; overall: number | null; components: Components | null;
  requiredSkillMatch: number | null; claimedYears: number | null; requirements: { kind: string; skill: string; status: MatchStatus }[];
  verification: VerdictCounts; explanation: string | null; decision: string | null;
}

function Compare() {
  const ids = (useSearchParams().get("ids") ?? "").split(",").filter(Boolean);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ids.length < 2) { setRows([]); return; }
    api<{ candidates: Row[] }>("/candidates/compare", { method: "POST", body: { ids } }).then((r) => setRows(r.candidates)).catch((e) => setError(errMsg(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  if (error) return <ErrorBanner message={error} />;
  if (!rows) return <Spinner />;
  if (rows.length < 2) return <Card><Empty title="Choose at least two candidates">Select them on the <Link href="/candidates" className="text-brand-600 underline">Candidates</Link> page.</Empty></Card>;
  const skills = [...new Set(rows.flatMap((r) => r.requirements.filter((q) => q.kind === "REQUIRED").map((q) => q.skill)))];
  const cell = (r: Row, k: keyof Components) => (r.components ? pct(r.components[k]) : "—");

  return (
    <>
      <div className="mb-4"><Notice>Ranked by the computed match score only. Names, demographics and other protected characteristics are never used. Open each candidate to see why the score is what it is.</Notice></div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-2 font-medium">Measure</th>{rows.map((r) => <th key={r.id} className="px-4 py-2 font-medium normal-case"><Link href={`/candidates/${r.id}`} className="text-sm text-brand-600 hover:underline">{r.name ?? "Unnamed"}</Link></th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr><td className="px-4 py-3 font-medium">Overall match</td>{rows.map((r) => <td key={r.id} className="px-4 py-3 text-lg font-semibold tabular-nums">{r.overall === null ? "—" : `${Math.round(r.overall)}%`}</td>)}</tr>
            <tr><td className="px-4 py-3">Required skill match</td>{rows.map((r) => <td key={r.id} className="px-4 py-3 tabular-nums">{pct(r.requiredSkillMatch)}</td>)}</tr>
            <tr><td className="px-4 py-3">JD skill match (weighted)</td>{rows.map((r) => <td key={r.id} className="px-4 py-3 tabular-nums">{cell(r, "requiredSkill")}</td>)}</tr>
            <tr><td className="px-4 py-3">Experience (verified)</td>{rows.map((r) => <td key={r.id} className="px-4 py-3 tabular-nums">{cell(r, "verifiedExperience")} <span className="text-xs text-slate-500">({r.claimedYears ?? "?"} yrs claimed)</span></td>)}</tr>
            <tr><td className="px-4 py-3">Project relevance</td>{rows.map((r) => <td key={r.id} className="px-4 py-3 tabular-nums">{cell(r, "projectRelevance")}</td>)}</tr>
            <tr><td className="px-4 py-3">Evidence score</td>{rows.map((r) => <td key={r.id} className="px-4 py-3 tabular-nums">{cell(r, "technicalEvidence")}</td>)}</tr>
            <tr><td className="px-4 py-3">Resume consistency</td>{rows.map((r) => <td key={r.id} className="px-4 py-3 tabular-nums">{cell(r, "consistency")}</td>)}</tr>
            <tr><td className="px-4 py-3">Verification summary</td>{rows.map((r) => <td key={r.id} className="px-4 py-3"><VerdictSummary counts={r.verification} /></td>)}</tr>
            {skills.map((s) => (
              <tr key={s}><td className="px-4 py-3">{s}</td>{rows.map((r) => { const q = r.requirements.find((x) => x.skill === s); return <td key={r.id} className="px-4 py-3">{q ? <StatusBadge status={q.status} /> : "—"}</td>; })}</tr>
            ))}
            <tr><td className="px-4 py-3 align-top">Why</td>{rows.map((r) => <td key={r.id} className="px-4 py-3 align-top text-xs text-slate-600">{r.explanation ?? "—"}</td>)}</tr>
            <tr><td className="px-4 py-3">Recruiter decision</td>{rows.map((r) => <td key={r.id} className="px-4 py-3">{r.decision ? r.decision.charAt(0) + r.decision.slice(1).toLowerCase() : "—"}</td>)}</tr>
          </tbody>
        </table>
      </Card>
    </>
  );
}

export default function ComparePage() {
  return (
    <>
      <PageHeader title="Compare candidates" />
      <Suspense fallback={<Spinner />}><Compare /></Suspense>
    </>
  );
}
