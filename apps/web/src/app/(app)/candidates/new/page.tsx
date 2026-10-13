"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { api, errMsg } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { Button, Card, ErrorBanner, Label, Notice, PageHeader, Select, Spinner } from "@/components/ui";
import type { Job } from "@/types";

function Form() {
  const router = useRouter();
  const preset = useSearchParams().get("jobId") ?? "";
  const jobs = useApi<{ jobs: Job[] }>("/jobs");
  const [f, setF] = useState({ jobId: preset, consent: false });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return setError("Choose a PDF resume.");
    if (file.size > 5 * 1024 * 1024) return setError("The file is larger than 5 MB.");
    setBusy(true);
    setError(null);
    let id: string | null = null;
    try {
      const c = await api<{ candidate: { id: string } }>("/candidates", {
        method: "POST",
        body: { jobId: f.jobId, consentGiven: f.consent },
      });
      id = c.candidate.id;
      const form = new FormData();
      form.append("file", file);
      await api(`/candidates/${id}/resume`, { method: "POST", form });
      await api(`/candidates/${id}/analyze`, { method: "POST" });
      router.push(`/candidates/${id}`);
    } catch (err) {
      // The candidate exists even if the upload failed; send the recruiter to it so they can retry there.
      setError(errMsg(err) + (id ? " The candidate was created; you can retry from the candidate page." : ""));
      setBusy(false);
      if (id) setTimeout(() => router.push(`/candidates/${id}`), 2500);
    }
  }

  return (
    <Card className="max-w-3xl p-6">
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner message={error} />
        <label className="block">
          <Label>Job</Label>
          <Select required value={f.jobId} onChange={(e) => setF({ ...f, jobId: e.target.value })}>
            <option value="">Select a job…</option>
            {jobs.data?.jobs.map((j) => <option key={j.id} value={j.id}>{j.title}{j.company ? ` · ${j.company}` : ""}</option>)}
          </Select>
        </label>
        <label className="block">
          <Label hint="PDF, max 5 MB, text-based (not a scan)">Resume</Label>
          <input type="file" accept="application/pdf,.pdf" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700" />
        </label>
        <Notice>
          Name, contact details and GitHub / LinkedIn / LeetCode links are read from the resume automatically. GitHub data is collected through the official public API; LinkedIn and LeetCode data is used only if the candidate supplies it. Nothing is scraped.
        </Notice>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-1" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
          <span>The candidate has agreed to the verification of their resume against their public profiles. Without this, only the resume itself is analyzed and no GitHub data is collected.</span>
        </label>
        <Button type="submit" loading={busy}>{busy ? "Uploading and starting analysis…" : "Upload and analyze"}</Button>
      </form>
    </Card>
  );
}

export default function NewCandidatePage() {
  return (
    <>
      <PageHeader title="Add candidate" subtitle="Upload a resume; everything else is extracted from it and the analysis starts automatically." />
      <Suspense fallback={<Spinner />}><Form /></Suspense>
    </>
  );
}
