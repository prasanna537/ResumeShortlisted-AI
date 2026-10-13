"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { Button, Card, CardHeader, ErrorBanner, Input, Label, Notice, PageHeader, Spinner, Textarea } from "@/components/ui";
import type { CandidateRow, Job } from "@/types";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const warning = useSearchParams().get("warning");
  const { data, error, loading, reload } = useApi<{ job: Job }>(`/jobs/${id}`);
  const cands = useApi<{ candidates: CandidateRow[] }>(`/candidates?jobId=${id}`);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ title: "", company: "", location: "", experienceYears: "", description: "" });
  const [msg, setMsg] = useState<string | null>(warning);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const job = data?.job;
  useEffect(() => {
    if (job) setF({ title: job.title, company: job.company ?? "", location: job.location ?? "", experienceYears: job.experienceYears?.toString() ?? "", description: job.description });
  }, [job]);

  async function save(reextract: boolean) {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ warning?: string }>(`/jobs/${id}`, {
        method: "PUT",
        body: { title: f.title, company: f.company || null, location: f.location || null, experienceYears: f.experienceYears ? Number(f.experienceYears) : null, description: f.description, reextract },
      });
      setMsg(r.warning ?? null);
      setEdit(false);
      await reload();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function toggleStatus() {
    await api(`/jobs/${id}`, { method: "PUT", body: { status: job!.status === "ACTIVE" ? "CLOSED" : "ACTIVE" } });
    reload();
  }
  async function remove() {
    if (!confirm("Delete this job and all of its candidates and analysis data? This cannot be undone.")) return;
    try {
      await api(`/jobs/${id}`, { method: "DELETE" });
      router.replace("/jobs");
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  if (loading) return <Spinner />;
  if (error || !job) return <ErrorBanner message={error ?? "Job not found"} />;
  const req = (k: "REQUIRED" | "PREFERRED") => job.requirements.filter((r) => r.kind === k);

  return (
    <>
      <PageHeader
        title={job.title}
        subtitle={[job.company, job.location, job.status === "ACTIVE" ? "Active" : "Closed"].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link href={`/candidates/new?jobId=${id}`}><Button>Add candidate</Button></Link>
            <Button variant="secondary" onClick={() => setEdit(!edit)}>{edit ? "Cancel edit" : "Edit"}</Button>
            <Button variant="secondary" onClick={toggleStatus}>{job.status === "ACTIVE" ? "Close job" : "Reopen"}</Button>
            <Button variant="danger" onClick={remove}>Delete</Button>
          </>
        }
      />
      <div className="space-y-4">
        {msg && <Notice>{msg}</Notice>}
        <ErrorBanner message={err} />
        {edit ? (
          <Card className="space-y-4 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><Label>Job title</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
              <label className="block"><Label>Company</Label><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></label>
              <label className="block"><Label>Location</Label><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
              <label className="block"><Label>Minimum experience (years)</Label><Input type="number" step="0.5" value={f.experienceYears} onChange={(e) => setF({ ...f, experienceYears: e.target.value })} /></label>
            </div>
            <label className="block"><Label>Job description</Label><Textarea rows={12} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
            <div className="flex gap-2">
              <Button loading={busy} onClick={() => save(true)}>Save and re-extract requirements</Button>
              <Button variant="secondary" disabled={busy} onClick={() => save(false)}>Save without re-extracting</Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Description" />
              <p className="whitespace-pre-wrap px-5 py-4 text-sm text-slate-700">{job.description}</p>
            </Card>
            <Card>
              <CardHeader title="Extracted requirements" action={<Button variant="ghost" className="!px-2 !py-1 text-xs" loading={busy} onClick={() => save(true)}>Re-extract</Button>} />
              <div className="space-y-4 px-5 py-4 text-sm">
                {(["REQUIRED", "PREFERRED"] as const).map((k) => (
                  <div key={k}>
                    <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{k === "REQUIRED" ? "Required skills" : "Preferred skills"}</div>
                    {req(k).length ? <div className="flex flex-wrap gap-1.5">{req(k).map((r) => <span key={r.id} className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">{r.skill}</span>)}</div> : <span className="text-slate-400">None extracted</span>}
                  </div>
                ))}
                <div><span className="text-slate-500">Experience: </span>{job.experienceYears !== null ? `${job.experienceYears}+ years` : "not specified"}</div>
                <div><span className="text-slate-500">Education: </span>{job.education ?? "not specified"}</div>
                {job.responsibilities.length > 0 && (
                  <div><div className="mb-1 text-xs font-semibold uppercase text-slate-500">Responsibilities</div><ul className="list-disc space-y-0.5 pl-4 text-slate-700">{job.responsibilities.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
                )}
                {job.keywords.length > 0 && <div><div className="mb-1 text-xs font-semibold uppercase text-slate-500">Keywords</div><div className="text-slate-700">{job.keywords.join(", ")}</div></div>}
              </div>
            </Card>
          </div>
        )}
        <Card>
          <CardHeader title={`Candidates (${cands.data?.candidates.length ?? 0})`} />
          <div className="divide-y divide-slate-100 text-sm">
            {(cands.data?.candidates ?? []).map((c) => (
              <Link key={c.id} href={`/candidates/${c.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                <span className="font-medium">{c.name ?? "Unnamed candidate"}</span>
                <span className="tabular-nums text-slate-600">{c.matchScore === null ? "Not scored" : `${Math.round(c.matchScore)}%`}</span>
              </Link>
            ))}
            {!cands.data?.candidates.length && <div className="px-5 py-6 text-slate-500">No candidates for this job yet.</div>}
          </div>
        </Card>
      </div>
    </>
  );
}
