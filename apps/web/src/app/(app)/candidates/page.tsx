"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { Button, Card, Empty, ErrorBanner, PageHeader, Spinner, fmtDate } from "@/components/ui";
import { VerdictSummary, statusLabel } from "@/components/StatusBadge";
import type { CandidateRow } from "@/types";

export default function CandidatesPage() {
  const { data, error, loading } = useApi<{ candidates: CandidateRow[] }>("/candidates", { pollMs: 8000 });
  const [sel, setSel] = useState<string[]>([]);
  const router = useRouter();
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 6 ? [...s, id] : s));

  return (
    <>
      <PageHeader
        title="Candidates"
        subtitle="Select 2–6 candidates to compare. Decisions are always yours."
        actions={
          <>
            <Button variant="secondary" disabled={sel.length < 2} onClick={() => router.push(`/compare?ids=${sel.join(",")}`)}>Compare ({sel.length})</Button>
            <Link href="/candidates/new"><Button><Plus className="h-4 w-4" aria-hidden /> Add candidate</Button></Link>
          </>
        }
      />
      {loading ? <Spinner /> : error ? <ErrorBanner message={error} /> : (
        <Card>
          {data!.candidates.length === 0 ? <Empty title="No candidates yet" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 text-xs uppercase text-slate-500">
                  <tr>{["", "Candidate", "Job", "Match", "Verification", "Status", "Decision", "Added"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data!.candidates.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${c.name ?? "candidate"} for comparison`} checked={sel.includes(c.id)} onChange={() => toggle(c.id)} /></td>
                      <td className="px-4 py-3"><Link href={`/candidates/${c.id}`} className="font-medium text-brand-600 hover:underline">{c.name ?? "Unnamed candidate"}</Link></td>
                      <td className="px-4 py-3 text-slate-600">{c.job.title}</td>
                      <td className="px-4 py-3 tabular-nums">{c.matchScore === null ? "—" : `${Math.round(c.matchScore)}%`}</td>
                      <td className="px-4 py-3"><VerdictSummary counts={c.verification} /></td>
                      <td className="px-4 py-3 text-slate-600">{statusLabel(c.status)}</td>
                      <td className="px-4 py-3 text-slate-600">{c.decision ? c.decision.charAt(0) + c.decision.slice(1).toLowerCase() : "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
