"use client";
import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { Button, ErrorBanner, Spinner, fmtDate, pct } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import type { Components, Job, JdMatch, VerificationItem, Verdict } from "@/types";

interface Report {
  candidate: { id: string; name: string | null; email: string | null; recruiterNotes: string | null };
  job: Job | null;
  verification: { summary: Record<Verdict, number>; results: VerificationItem[] };
  score: { overall: number; components: Components; weightsUsed: Components; explanation: string | null; breakdown: Omit<JdMatch, "components" | "weights" | "overall"> } | null;
  decision: { decision: string; notes: string | null } | null;
  sources: { provider: string; url: string; origin: string; collectedAt: string | null }[];
  generatedAt: string;
}

const LABELS: Record<keyof Components, string> = { requiredSkill: "JD skill match", verifiedExperience: "Verified experience", projectRelevance: "Project relevance", technicalEvidence: "Technical evidence", consistency: "Resume consistency" };

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const { data: r, error, loading } = useApi<Report>(`/candidates/${id}/report`);
  if (loading) return <Spinner />;
  if (error || !r) return <ErrorBanner message={error} />;
  const groups: Verdict[] = ["VERIFIED", "PARTIAL", "UNVERIFIED", "CONTRADICTED"];

  return (
    <article className="mx-auto max-w-4xl space-y-6 text-sm">
      <div className="no-print flex justify-end"><Button onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden /> Print / Save as PDF</Button></div>
      <header className="border-b border-slate-300 pb-4">
        <h1 className="text-2xl font-bold">Candidate verification report</h1>
        <p className="mt-1 text-slate-600">{r.candidate.name ?? "Unnamed candidate"}{r.candidate.email ? ` · ${r.candidate.email}` : ""} · {r.job?.title ?? "—"}</p>
        <p className="text-xs text-slate-500">Generated {fmtDate(r.generatedAt)}. Verdicts and scores support, but do not replace, the recruiter&apos;s judgement.</p>
      </header>

      <section>
        <h2 className="mb-2 text-base font-semibold">Job requirements</h2>
        {r.job ? (
          <ul className="space-y-1">
            <li><strong>Required:</strong> {r.job.requirements.filter((x) => x.kind === "REQUIRED").map((x) => x.skill).join(", ") || "—"}</li>
            <li><strong>Preferred:</strong> {r.job.requirements.filter((x) => x.kind === "PREFERRED").map((x) => x.skill).join(", ") || "—"}</li>
            <li><strong>Experience:</strong> {r.job.experienceYears !== null ? `${r.job.experienceYears}+ years` : "not specified"} · <strong>Education:</strong> {r.job.education ?? "not specified"}</li>
          </ul>
        ) : "—"}
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Score</h2>
        {r.score ? (
          <>
            <p className="mb-2 text-3xl font-bold">{Math.round(r.score.overall)}% <span className="text-sm font-normal text-slate-500">overall match (rule-based)</span></p>
            <table className="w-full border border-slate-200 text-left">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-1.5">Component</th><th className="px-3 py-1.5">Score</th><th className="px-3 py-1.5">Weight</th></tr></thead>
              <tbody>{(Object.keys(LABELS) as (keyof Components)[]).map((k) => <tr key={k} className="border-t border-slate-100"><td className="px-3 py-1.5">{LABELS[k]}</td><td className="px-3 py-1.5">{pct(r.score!.components[k])}</td><td className="px-3 py-1.5">{pct(r.score!.weightsUsed[k])}</td></tr>)}</tbody>
            </table>
            {r.score.explanation && <p className="mt-3 text-slate-700">{r.score.explanation}</p>}
            <h3 className="mb-1 mt-4 font-semibold">Skill match</h3>
            <ul className="grid gap-1 sm:grid-cols-2">{r.score.breakdown.requirements.map((m) => <li key={m.requirementId} className="flex items-center justify-between rounded border border-slate-200 px-2 py-1"><span>{m.skill} <span className="text-xs text-slate-500">({m.kind.toLowerCase()})</span></span><StatusBadge status={m.status} /></li>)}</ul>
            <p className="mt-2 text-slate-600">Experience: {r.score.breakdown.claimedYears} years claimed; {r.score.breakdown.requiredYears ?? "no"} years required.</p>
          </>
        ) : <p className="text-slate-500">No score yet.</p>}
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Claim verification</h2>
        <p className="mb-3 text-slate-600">{groups.map((g) => `${g.toLowerCase()}: ${r.verification.summary[g]}`).join(" · ")}</p>
        {groups.map((g) => {
          const rows = r.verification.results.filter((v) => v.verdict === g);
          if (!rows.length) return null;
          return (
            <div key={g} className="mb-4 break-inside-avoid">
              <h3 className="mb-1"><StatusBadge status={g} /></h3>
              <ul className="space-y-2">
                {rows.map((v) => (
                  <li key={v.id} className="rounded border border-slate-200 p-2">
                    <div className="font-medium">{v.claim.claimText} <span className="font-normal text-slate-500">({pct(v.confidence)} confidence)</span></div>
                    <div className="text-slate-700">{v.reason}</div>
                    {v.evidence.map((e) => <div key={e.id} className="mt-1 text-xs text-slate-600">• {e.source}: {e.evidenceText.slice(0, 160)}{e.sourceUrl ? ` (${e.sourceUrl})` : ""}</div>)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Evidence sources</h2>
        {r.sources.length ? <ul>{r.sources.map((s) => <li key={s.provider}>{s.provider}: {s.url} <span className="text-slate-500">({s.origin.toLowerCase().replace(/_/g, " ")}, collected {fmtDate(s.collectedAt)})</span></li>)}</ul> : <p className="text-slate-500">No external profiles. Resume only.</p>}
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Recruiter notes and decision</h2>
        <p><strong>Notes:</strong> {r.candidate.recruiterNotes || "—"}</p>
        <p><strong>Final recruiter decision:</strong> {r.decision ? r.decision.decision.toLowerCase() : "not yet decided"}{r.decision?.notes ? ` — ${r.decision.notes}` : ""}</p>
      </section>
    </article>
  );
}
