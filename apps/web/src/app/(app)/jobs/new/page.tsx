"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errMsg } from "@/lib/api";
import { Button, Card, ErrorBanner, Input, Label, PageHeader, Textarea } from "@/components/ui";

export default function NewJobPage() {
  const router = useRouter();
  const [f, setF] = useState({ title: "", company: "", location: "", experienceYears: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ job: { id: string }; warning?: string }>("/jobs", {
        method: "POST",
        body: {
          title: f.title,
          company: f.company || null,
          location: f.location || null,
          experienceYears: f.experienceYears ? Number(f.experienceYears) : null,
          description: f.description,
        },
      });
      router.push(`/jobs/${r.job.id}${r.warning ? `?warning=${encodeURIComponent(r.warning)}` : ""}`);
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="New job description" subtitle="Paste the full JD. Requirements are extracted automatically and can be re-extracted after edits." />
      <Card className="max-w-3xl p-6">
        <form onSubmit={submit} className="space-y-4">
          <ErrorBanner message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><Label>Job title</Label><Input required value={f.title} onChange={set("title")} /></label>
            <label className="block"><Label>Company</Label><Input value={f.company} onChange={set("company")} /></label>
            <label className="block"><Label>Location</Label><Input value={f.location} onChange={set("location")} /></label>
            <label className="block"><Label hint="optional; otherwise taken from the JD">Minimum experience (years)</Label><Input type="number" min={0} max={60} step="0.5" value={f.experienceYears} onChange={set("experienceYears")} /></label>
          </div>
          <label className="block"><Label>Job description</Label><Textarea required rows={12} minLength={20} value={f.description} onChange={set("description")} placeholder="Paste the complete job description here..." /></label>
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>{busy ? "Creating and extracting..." : "Create job"}</Button>
            <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
