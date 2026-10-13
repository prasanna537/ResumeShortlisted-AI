"use client";
import Link from "next/link";
import { useApi } from "@/hooks/useApi";
import { Card, Empty, ErrorBanner, PageHeader, Spinner, fmtDate } from "@/components/ui";
import type { CandidateRow } from "@/types";

export default function ReportsPage() {
  const { data, error, loading } = useApi<{ candidates: CandidateRow[] }>("/candidates");
  const rows = (data?.candidates ?? []).filter((c) => c.status === "COMPLETED");
  return (
    <>
      <PageHeader title="Reports" subtitle="Printable reports for analyzed candidates (use Print → Save as PDF)." />
      {loading ? <Spinner /> : error ? <ErrorBanner message={error} /> : (
        <Card>
          {rows.length === 0 ? <Empty title="No analyzed candidates yet" /> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {rows.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-5 py-3">
                  <span><span className="font-medium">{c.name ?? "Unnamed candidate"}</span> <span className="text-slate-500">· {c.job.title} · {fmtDate(c.createdAt)}</span></span>
                  <Link href={`/candidates/${c.id}/report`} className="text-brand-600 hover:underline">Open report</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
