"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import clsx from "clsx";
import { api, errMsg } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import { Button, Card, CardHeader, ErrorBanner, Notice, PageHeader, Spinner, Textarea } from "@/components/ui";
import { EvidenceDrawer, type DrawerData } from "@/features/candidate/EvidenceDrawer";
import { ClaimList, EvidenceTab, JdMatchTab, RequiredSkills, ResumeTab, ScoreCard, requirementDrawer } from "@/features/candidate/tabs";
import type { CandidateDetail, EvidenceItem, JdMatch, VerificationItem } from "@/types";

const TABS = ["Overview", "Resume", "Verification", "Evidence", "JD Match"] as const;
type Tab = (typeof TABS)[number];
const RUNNING = (s?: string) => !!s && s !== "COMPLETED" && s !== "FAILED";

export default function CandidatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Overview");
  const [drawer, setDrawer] = useState<DrawerData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cand = useApi<{ candidate: CandidateDetail }>(`/candidates/${id}`);
  const status = cand.data?.candidate.analysisJobs[0]?.status;
  // Poll the analysis while it runs, and refresh the candidate when it finishes.
  const analysis = useApi<{ analysis: CandidateDetail["analysisJobs"][number] | null }>(`/candidates/${id}/analysis`, { pollMs: RUNNING(status) ? 1500 : undefined });
  const live = analysis.data?.analysis ?? cand.data?.candidate.analysisJobs[0] ?? null;
  const done = live?.status === "COMPLETED";

  const verif = useApi<{ results: VerificationItem[] }>(done ? `/candidates/${id}/verification` : null);
  const evid = useApi<{ evidence: EvidenceItem[] }>(done || tab === "Evidence" ? `/candidates/${id}/evidence` : null);
  const match = useApi<JdMatch>(done ? `/candidates/${id}/jd-match` : null);
  const resume = useApi<{ resume: NonNullable<Parameters<typeof ResumeTab>[0]["resume"]> | null }>(tab === "Resume" ? `/candidates/${id}/resume` : null);

  const { reload: reloadCand } = cand;
  useEffect(() => {
    if (live?.status === "COMPLETED" || live?.status === "FAILED") reloadCand();
  }, [live?.status, reloadCand]);

  const refreshAll = useCallback(() => {
    cand.reload(); analysis.reload(); verif.reload(); evid.reload(); match.reload();
  }, [cand.reload, analysis.reload, verif.reload, evid.reload, match.reload]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); refreshAll(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  const reanalyze = () => act(() => api(`/candidates/${id}/analyze`, { method: "POST" }));
  const decide = (decision: string) => act(() => api(`/candidates/${id}/shortlist`, { method: "POST", body: { decision } }));
  const clearDecision = () => act(() => api(`/candidates/${id}/shortlist`, { method: "DELETE" }));
  async function remove() {
    if (!confirm("Delete this candidate and ALL collected data (resume file, claims, evidence, scores)? This cannot be undone.")) return;
    try { await api(`/candidates/${id}`, { method: "DELETE" }); router.replace("/candidates"); } catch (e) { setErr(errMsg(e)); }
  }

  const [notes, setNotes] = useState<string | null>(null);
  useEffect(() => { if (cand.data && notes === null) setNotes(cand.data.candidate.recruiterNotes ?? ""); }, [cand.data, notes]);
  const saveNotes = () => notes !== null && api(`/candidates/${id}/notes`, { method: "PUT", body: { notes } }).catch((e) => setErr(errMsg(e)));

  if (cand.loading) return <Spinner />;
  if (cand.error || !cand.data) return <ErrorBanner message={cand.error ?? "Candidate not found"} />;
  const c = cand.data.candidate;
  const score = c.scores[0];
  const verifs = verif.data?.results ?? [];
  const evidence = evid.data?.evidence ?? [];
  const decision = c.shortlist?.decision;
  const warnings = (live?.warnings ?? []).filter(Boolean);

  return (
    <>
      <PageHeader
        title={c.name ?? "Unnamed candidate"}
        subtitle={<>Applying for <Link href={`/jobs/${c.job.id}`} className="text-brand-600 hover:underline">{c.job.title}</Link>{c.email ? ` · ${c.email}` : ""}</>}
        actions={
          <>
            <Link href={`/candidates/${id}/report`}><Button variant="secondary"><FileText className="h-4 w-4" aria-hidden /> Report</Button></Link>
            <Button variant="secondary" loading={busy && RUNNING(live?.status)} disabled={busy || RUNNING(live?.status) || !c.resumes.length} onClick={reanalyze}>{done || live?.status === "FAILED" ? "Re-run analysis" : "Run analysis"}</Button>
            <Button variant="danger" onClick={remove}>Delete data</Button>
          </>
        }
      />
      <ErrorBanner message={err} />

      {live && live.status !== "COMPLETED" && (
        <Card className="mb-4 p-5"><AnalysisProgress status={live.status} error={live.error} /></Card>
      )}
      {!live && <div className="mb-4"><Notice>No analysis has run yet. {c.resumes.length ? "Click “Run analysis”." : "Upload a resume first."}</Notice></div>}
      {warnings.length > 0 && (
        <div className="mb-4 space-y-1">{warnings.map((w, i) => <Notice key={i}>{w}</Notice>)}</div>
      )}

      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="text-sm">
          <span className="text-slate-500">Recruiter decision: </span>
          <strong>{decision ? decision.charAt(0) + decision.slice(1).toLowerCase() : "None yet"}</strong>
          <span className="ml-2 text-xs text-slate-500">Scores inform your decision; they never decide it.</span>
        </div>
        <div className="flex gap-2">
          <Button variant={decision === "SHORTLISTED" ? "primary" : "secondary"} disabled={busy} onClick={() => decide("SHORTLISTED")}>Shortlist</Button>
          <Button variant={decision === "REVIEW" ? "primary" : "secondary"} disabled={busy} onClick={() => decide("REVIEW")}>Needs review</Button>
          <Button variant={decision === "REJECTED" ? "primary" : "secondary"} disabled={busy} onClick={() => decide("REJECTED")}>Reject</Button>
          {decision && <Button variant="ghost" disabled={busy} onClick={clearDecision}>Clear</Button>}
        </div>
      </Card>

      <div role="tablist" aria-label="Candidate sections" className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={clsx("-mb-px border-b-2 px-4 py-2 text-sm font-medium", tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800")}>{t}</button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="space-y-4">
          <ScoreCard score={score} />
          {score?.explanation && (
            <Card><CardHeader title="Explanation" /><p className="px-5 py-4 text-sm text-slate-700">{score.explanation}</p><p className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">Wording generated by AI from the computed figures; the numbers are calculated by the application.</p></Card>
          )}
          <RequiredSkills match={match.data} onOpen={(m) => setDrawer(requirementDrawer(m, verifs, evidence))} />
          {done && <ClaimList verifs={verifs} onOpen={setDrawer} limit={12} />}
          <Card>
            <CardHeader title="Data sources" />
            <ul className="divide-y divide-slate-100 text-sm">
              <li className="flex justify-between px-5 py-2"><span>Resume</span><span className="text-slate-500">{c.resumes[0]?.fileName ?? "not uploaded"}</span></li>
              {c.externalProfiles.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 px-5 py-2">
                  <span>{p.provider.charAt(0) + p.provider.slice(1).toLowerCase()}</span>
                  <span className="truncate text-right text-slate-500">{p.lastError ? p.lastError : p.collectedAt ? "collected via official API" : p.provider === "GITHUB" ? "pending" : "URL stored; data used only if candidate-provided"}</span>
                </li>
              ))}
              <li className="px-5 py-2 text-xs text-slate-500">Consent recorded: {c.consentGiven ? "yes" : "no"}</li>
            </ul>
          </Card>
          <Card>
            <CardHeader title="Recruiter notes" />
            <div className="p-4"><Textarea rows={4} value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} placeholder="Private notes (saved when you click away)" /></div>
          </Card>
        </div>
      )}
      {tab === "Resume" && <ResumeTab resume={resume.loading ? undefined : resume.data?.resume ?? null} />}
      {tab === "Verification" && (verif.loading && done ? <Spinner /> : !done ? <Card className="p-6 text-sm text-slate-500">Verification results appear when the analysis completes.</Card> : <ClaimList verifs={verifs} onOpen={setDrawer} />)}
      {tab === "Evidence" && <EvidenceTab evidence={evid.data ? evidence : null} candidate={c} onChanged={refreshAll} />}
      {tab === "JD Match" && <JdMatchTab match={match.data} onOpen={(m) => setDrawer(requirementDrawer(m, verifs, evidence))} />}

      <EvidenceDrawer data={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}
