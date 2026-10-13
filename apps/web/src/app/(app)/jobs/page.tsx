"use client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { Button, Card, Empty, ErrorBanner, PageHeader, Spinner, fmtDate } from "@/components/ui";
import type { Job } from "@/types";

export default function JobsPage() {
  const { data, error, loading } = useApi<{ jobs: Job[] }>("/jobs");
  return (
    <>
      <PageHeader title="Job descriptions" actions={<Link href="/jobs/new"><Button><Plus className="h-4 w-4" aria-hidden /> New job</Button></Link>} />
      {loading ? <Spinner /> : error ? <ErrorBanner message={error} /> : (
        <Card>
          {data!.jobs.length === 0 ? <Empty title="No jobs yet">Create a job to start screening candidates.</Empty> : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase text-slate-500">
                <tr>{["Title", "Company", "Required skills", "Candidates", "Status", "Created"].map((h) => <th key={h} className="px-5 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data!.jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3"><Link href={`/jobs/${j.id}`} className="font-medium text-brand-600 hover:underline">{j.title}</Link></td>
                    <td className="px-5 py-3 text-slate-600">{j.company ?? "—"}</td>
                    <td className="px-5 py-3 text-slate-600">{j.requirements.filter((r) => r.kind === "REQUIRED").map((r) => r.skill).join(", ") || "—"}</td>
                    <td className="px-5 py-3 tabular-nums">{j._count?.candidates ?? 0}</td>
                    <td className="px-5 py-3">{j.status === "ACTIVE" ? "Active" : "Closed"}</td>
                    <td className="px-5 py-3 text-slate-600">{fmtDate(j.createdAt)}</td>
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
