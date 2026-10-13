"use client";
import Link from "next/link";
import { useApi } from "@/hooks/useApi";
import { Card, Empty, ErrorBanner, PageHeader, Spinner, fmtDate } from "@/components/ui";

interface Row { id: string; decision: string; notes: string | null; updatedAt: string; candidate: { id: string; name: string | null; job: { id: string; title: string }; matchScore: number | null } }

export default function ShortlistedPage() {
  const { data, error, loading } = useApi<{ shortlist: Row[] }>("/shortlist");
  return (
    <>
      <PageHeader title="Shortlisted" subtitle="Candidates you have marked. Every decision here was made by a recruiter." />
      {loading ? <Spinner /> : error ? <ErrorBanner message={error} /> : (
        <Card>
          {data!.shortlist.length === 0 ? <Empty title="Nothing here yet">Use the buttons on a candidate page to shortlist, flag for review, or reject.</Empty> : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase text-slate-500"><tr>{["Candidate", "Job", "Match", "Decision", "Notes", "Updated"].map((h) => <th key={h} className="px-5 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data!.shortlist.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3"><Link href={`/candidates/${r.candidate.id}`} className="font-medium text-brand-600 hover:underline">{r.candidate.name ?? "Unnamed candidate"}</Link></td>
                    <td className="px-5 py-3 text-slate-600">{r.candidate.job.title}</td>
                    <td className="px-5 py-3 tabular-nums">{r.candidate.matchScore === null ? "—" : `${Math.round(r.candidate.matchScore)}%`}</td>
                    <td className="px-5 py-3">{r.decision.charAt(0) + r.decision.slice(1).toLowerCase()}</td>
                    <td className="max-w-xs truncate px-5 py-3 text-slate-600">{r.notes ?? "—"}</td>
                    <td className="px-5 py-3 text-slate-600">{fmtDate(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </>
  );
}
