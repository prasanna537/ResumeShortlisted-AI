"use client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { Button, Card, CardHeader, Empty, ErrorBanner, PageHeader, Spinner, fmtDate } from "@/components/ui";
import { VerdictSummary, statusLabel } from "@/components/StatusBadge";
import type { AnalysisStatus, VerdictCounts } from "@/types";

interface Dash {
  stats: { totalJobs: number; activeJobs: number; totalCandidates: number; analyzed: number; shortlisted: number; averageMatchScore: number | null };
  recent: { id: string; name: string | null; job: { id: string; title: string }; matchScore: number | null; status: AnalysisStatus; verification: VerdictCounts; createdAt: string }[];
}

export default function Dashboard() {
  const { data, error, loading } = useApi<Dash>("/dashboard", { pollMs: 10000 });
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBanner message={error} />;
  const s = data.stats;
  const tiles: [string, string | number][] = [
    ["Total jobs", s.totalJobs],
    ["Active jobs", s.activeJobs],
    ["Total candidates", s.totalCandidates],
    ["Analyzed", s.analyzed],
    ["Shortlisted", s.shortlisted],
    ["Average match", s.averageMatchScore === null ? "—" : `${s.averageMatchScore}%`],
  ];
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Scores are computed from verified evidence. You make every shortlisting decision."
        actions={<Link href="/candidates/new"><Button><Plus className="h-4 w-4" aria-hidden /> Add candidate</Button></Link>}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map(([label, v]) => (
          <Card key={label} className="px-4 py-3">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{v}</div>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Recent candidates" action={<Link href="/candidates" className="text-sm text-brand-600 hover:underline">View all</Link>} />
        {data.recent.length === 0 ? (
          <Empty title="No candidates yet">Create a job, then <Link className="text-brand-600 underline" href="/candidates/new">add a candidate</Link>.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase text-slate-500">
                <tr>{["Candidate", "Job", "Match score", "Verification", "Status", "Date", ""].map((h) => <th key={h} className="px-5 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recent.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium">{c.name ?? "Unnamed candidate"}</td>
                    <td className="px-5 py-3 text-slate-600">{c.job.title}</td>
                    <td className="px-5 py-3 tabular-nums">{c.matchScore === null ? "—" : `${Math.round(c.matchScore)}%`}</td>
                    <td className="px-5 py-3"><VerdictSummary counts={c.verification} /></td>
                    <td className="px-5 py-3 text-slate-600">{statusLabel(c.status)}</td>
                    <td className="px-5 py-3 text-slate-600">{fmtDate(c.createdAt)}</td>
                    <td className="px-5 py-3 text-right"><Link href={`/candidates/${c.id}`} className="text-brand-600 hover:underline">Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
