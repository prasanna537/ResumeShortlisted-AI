"use client";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { Button, Card, CardHeader, Empty, ErrorBanner, Label, Notice, Spinner, Textarea, fmtDate, pct } from "@/components/ui";
import { StatusBadge, statusSymbol } from "@/components/StatusBadge";
import { OverallScore, ScoreBar } from "@/components/ScoreBar";
import type { CandidateDetail, EvidenceItem, JdMatch, VerificationItem } from "@/types";
import type { DrawerData } from "./EvidenceDrawer";

type Open = (d: DrawerData) => void;

export const claimDrawer = (v: VerificationItem): DrawerData => ({
  kind: "claim",
  title: v.claim.claimText,
  status: v.verdict,
  confidence: v.confidence,
  reason: v.reason,
  evidence: v.evidence,
  sourceLocation: v.claim.sourceLocation,
});

/** Opens the evidence drawer for a JD requirement by joining the match with the verification and evidence lists. */
export const requirementDrawer = (m: JdMatch["requirements"][number], verifs: VerificationItem[], evidence: EvidenceItem[]): DrawerData => {
  const v = verifs.find((x) => x.claim.id === m.claimId);
  const ev = [...(v?.evidence ?? [])];
  for (const id of m.evidenceIds) {
    const e = evidence.find((x) => x.id === id);
    if (e && !ev.some((x) => x.id === id)) ev.push(e);
  }
  return {
    kind: "requirement",
    title: `${m.skill} (${m.kind === "REQUIRED" ? "required" : "preferred"})`,
    status: m.status,
    confidence: v?.confidence,
    reason: `${m.note}${v ? ` ${v.reason}` : ""}`,
    evidence: ev,
    sourceLocation: v?.claim.sourceLocation,
  };
};

const COMPONENT_LABELS: [keyof CandidateScoreComponents, string, string][] = [
  ["requiredSkill", "JD skill match", "Share of JD skills backed by verified claims or evidence (required skills; preferred skills add a small share)."],
  ["verifiedExperience", "Verified experience", "Claimed years vs. the requirement, scaled by how well experience claims were verified."],
  ["projectRelevance", "Project relevance", "Relevance of resume projects to the JD, scaled by how well they were verified."],
  ["technicalEvidence", "Technical evidence", "Share of required skills backed by independent (non-resume) evidence."],
  ["consistency", "Resume consistency", "Penalized only by claims that evidence contradicts; missing evidence is not penalized here."],
];
type CandidateScoreComponents = CandidateDetail["scores"][number]["components"];

export function ScoreCard({ score }: { score: CandidateDetail["scores"][number] | undefined }) {
  if (!score) return <Card className="p-6"><Empty title="No score yet">The score appears when the analysis completes.</Empty></Card>;
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <OverallScore score={score.overall} />
      <Card className="space-y-4 p-5">
        {COMPONENT_LABELS.map(([k, label, hint]) => (
          <ScoreBar key={k} label={label} value={score.components[k]} weight={score.weightsUsed[k]} hint={hint} />
        ))}
      </Card>
    </div>
  );
}

export function RequiredSkills({ match, onOpen }: { match: JdMatch | null; onOpen: (m: JdMatch["requirements"][number]) => void }) {
  if (!match) return null;
  const group = (k: "REQUIRED" | "PREFERRED") => match.requirements.filter((r) => r.kind === k);
  return (
    <Card>
      <CardHeader title="JD skills" action={<span className="text-xs text-slate-500">Click a skill to see evidence</span>} />
      <div className="grid gap-6 px-5 py-4 sm:grid-cols-2">
        {(["REQUIRED", "PREFERRED"] as const).map((k) => (
          <div key={k}>
            <div className="mb-2 text-xs font-semibold uppercase text-slate-500">{k === "REQUIRED" ? "Required" : "Preferred"}</div>
            {group(k).length === 0 ? <span className="text-sm text-slate-400">None</span> : (
              <ul className="space-y-1.5">
                {group(k).map((m) => (
                  <li key={m.requirementId}>
                    <button onClick={() => onOpen(m)} className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-left text-sm hover:border-brand-600 hover:bg-brand-50">
                      <span><span aria-hidden className="mr-1.5">{statusSymbol(m.status)}</span>{m.skill}</span>
                      <StatusBadge status={m.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ClaimList({ verifs, onOpen, limit }: { verifs: VerificationItem[]; onOpen: Open; limit?: number }) {
  const [filter, setFilter] = useState<string>("ALL");
  const rows = verifs.filter((v) => filter === "ALL" || v.verdict === filter).slice(0, limit);
  return (
    <Card>
      <CardHeader
        title="Verification"
        action={
          <select aria-label="Filter by verdict" value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-xs">
            <option value="ALL">All verdicts</option>
            {["VERIFIED", "PARTIAL", "UNVERIFIED", "CONTRADICTED"].map((v) => <option key={v}>{v}</option>)}
          </select>
        }
      />
      {rows.length === 0 ? <Empty title="No claims to show" /> : (
        <ul className="divide-y divide-slate-100">
          {rows.map((v) => (
            <li key={v.id}>
              <button onClick={() => onOpen(claimDrawer(v))} className="flex w-full items-start justify-between gap-3 px-5 py-3 text-left hover:bg-slate-50">
                <span className="min-w-0">
                  <span className="block text-sm text-slate-900"><span aria-hidden className="mr-1.5">{statusSymbol(v.verdict)}</span>{v.claim.claimText}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{v.claim.category.toLowerCase()} · {v.evidence.length} evidence item{v.evidence.length === 1 ? "" : "s"} · confidence {pct(v.confidence)}</span>
                </span>
                <StatusBadge status={v.verdict} className="shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ResumeTab({ resume }: { resume: { fileName: string; sizeBytes: number; createdAt: string; extractedText: string | null; structuredData: Record<string, unknown> | null } | null | undefined }) {
  const [raw, setRaw] = useState(false);
  if (resume === undefined) return <Spinner />;
  if (!resume) return <Card><Empty title="No resume uploaded" /></Card>;
  const s = (resume.structuredData ?? {}) as {
    skills?: string[]; experience?: { title: string; company: string | null; startDate: string | null; endDate: string | null; description: string }[];
    education?: { institution: string; degree: string | null; field: string | null; year: string | null }[];
    projects?: { name: string; description: string; technologies: string[] }[]; certifications?: string[];
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={resume.fileName} action={<span className="text-xs text-slate-500">{(resume.sizeBytes / 1024).toFixed(0)} KB · uploaded {fmtDate(resume.createdAt)}</span>} />
        {!resume.structuredData ? <p className="px-5 py-4 text-sm text-slate-500">Structured data appears after the analysis parses the resume.</p> : (
          <div className="space-y-4 px-5 py-4 text-sm">
            {s.skills?.length ? <Block title="Skills"><div className="flex flex-wrap gap-1.5">{s.skills.map((x) => <span key={x} className="rounded bg-slate-100 px-2 py-0.5">{x}</span>)}</div></Block> : null}
            {s.experience?.length ? <Block title="Experience">{s.experience.map((e, i) => <p key={i} className="mb-2"><strong>{e.title}</strong>{e.company ? ` · ${e.company}` : ""} <span className="text-slate-500">({e.startDate ?? "?"} – {e.endDate ?? "?"})</span><br /><span className="text-slate-700">{e.description}</span></p>)}</Block> : null}
            {s.projects?.length ? <Block title="Projects">{s.projects.map((p, i) => <p key={i} className="mb-2"><strong>{p.name}</strong> <span className="text-slate-500">{p.technologies.join(", ")}</span><br /><span className="text-slate-700">{p.description}</span></p>)}</Block> : null}
            {s.education?.length ? <Block title="Education">{s.education.map((e, i) => <p key={i}>{[e.degree, e.field].filter(Boolean).join(" in ")} · {e.institution} {e.year ? `(${e.year})` : ""}</p>)}</Block> : null}
            {s.certifications?.length ? <Block title="Certifications"><ul className="list-disc pl-4">{s.certifications.map((x) => <li key={x}>{x}</li>)}</ul></Block> : null}
          </div>
        )}
      </Card>
      <Card>
        <CardHeader title="Extracted text" action={<Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setRaw(!raw)}>{raw ? "Hide" : "Show"}</Button>} />
        {raw && <pre className="max-h-96 overflow-auto whitespace-pre-wrap px-5 py-4 text-xs text-slate-700">{resume.extractedText}</pre>}
      </Card>
    </div>
  );
}
const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div><div className="mb-1 text-xs font-semibold uppercase text-slate-500">{title}</div>{children}</div>
);

export function EvidenceTab({ evidence, candidate, onChanged }: { evidence: EvidenceItem[] | null; candidate: CandidateDetail; onChanged: () => void }) {
  const [gh, setGh] = useState(candidate.externalProfiles.find((p) => p.provider === "GITHUB")?.url ?? "");
  const [li, setLi] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function collectGithub() {
    setBusy("gh"); setErr(null); setMsg(null);
    try {
      const r = await api<{ ok: boolean; error?: string; evidenceItems?: number; warnings: string[] }>(`/candidates/${candidate.id}/github`, { method: "POST", body: { githubUrl: gh } });
      if (r.ok) setMsg(`Collected ${r.evidenceItems} evidence items from GitHub. Re-run the analysis to use them.`);
      else setErr(`${r.error} The candidate can still be evaluated using the available resume and profile evidence.`);
      onChanged();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(null); }
  }
  async function addLinkedIn() {
    setBusy("li"); setErr(null); setMsg(null);
    try {
      const data = JSON.parse(li);
      const r = await api<{ evidenceItems: number }>(`/candidates/${candidate.id}/linkedin`, { method: "POST", body: { data } });
      setMsg(`Stored ${r.evidenceItems} LinkedIn evidence items. Re-run the analysis to use them.`);
      onChanged();
    } catch (e) { setErr(e instanceof SyntaxError ? "That is not valid JSON." : errMsg(e)); } finally { setBusy(null); }
  }

  const groups = new Map<string, EvidenceItem[]>();
  for (const e of evidence ?? []) groups.set(e.source, [...(groups.get(e.source) ?? []), e]);

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <h3 className="text-sm font-semibold">Add or refresh evidence</h3>
        <ErrorBanner message={err} />
        {msg && <Notice>{msg}</Notice>}
        {!candidate.consentGiven && <Notice>Candidate consent is not recorded, so external data cannot be collected.</Notice>}
        <div className="flex gap-2">
          <input aria-label="GitHub profile URL" value={gh} onChange={(e) => setGh(e.target.value)} placeholder="https://github.com/username" className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <Button variant="secondary" loading={busy === "gh"} disabled={!gh || !candidate.consentGiven} onClick={collectGithub}>Collect GitHub</Button>
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-slate-600">Add candidate-provided LinkedIn data (JSON)</summary>
          <div className="mt-2 space-y-2">
            <Label hint='shape: {"headline":"","skills":[],"experience":[{"title","company","start","end","description"}],"education":[{"school","degree","field"}],"projects":[{"name","description"}]}'>Pasted or exported by the candidate. Nothing is scraped.</Label>
            <Textarea rows={6} value={li} onChange={(e) => setLi(e.target.value)} className="font-mono text-xs" />
            <Button variant="secondary" loading={busy === "li"} disabled={!li || !candidate.consentGiven} onClick={addLinkedIn}>Store LinkedIn data</Button>
          </div>
        </details>
      </Card>
      {evidence === null ? <Spinner /> : evidence.length === 0 ? <Card><Empty title="No evidence collected yet" /></Card> : [...groups.entries()].map(([src, items]) => (
        <Card key={src}>
          <CardHeader title={`${src === "RESUME" ? "Resume (self-reported)" : src.charAt(0) + src.slice(1).toLowerCase()} · ${items.length}`} />
          <ul className="divide-y divide-slate-100">
            {items.map((e) => (
              <li key={e.id} className="px-5 py-3 text-sm">
                <div className="mb-0.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>{e.evidenceType.replace(/_/g, " ")}</span><span>Collected {fmtDate(e.collectedAt)}</span>
                </div>
                <p className="text-slate-800">{e.evidenceText}</p>
                {e.sourceUrl && <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"><ExternalLink className="h-3 w-3" aria-hidden />{e.sourceUrl}</a>}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export function JdMatchTab({ match, onOpen }: { match: JdMatch | null; onOpen: (m: JdMatch["requirements"][number]) => void }) {
  if (!match) return <Card><Empty title="No JD match yet">Run the analysis to see how this candidate matches the job.</Empty></Card>;
  const sub = match.subScores;
  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold">How the match was calculated</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <ScoreBar label="Required skill match" value={sub.requiredSkillMatch} />
          <ScoreBar label="Preferred skill match" value={sub.preferredSkillMatch ?? 0} hint={sub.preferredSkillMatch === null ? "No preferred skills in this job" : undefined} />
          <ScoreBar label="Experience (years vs requirement)" value={sub.experienceYearsFactor} hint={`${match.claimedYears} years claimed on the resume; ${match.requiredYears ?? "no"} years required`} />
          <ScoreBar label="Experience claims verified" value={sub.experienceVerificationFactor} />
        </div>
        <p className="text-xs text-slate-500">Resume claims {match.claimedYears} years of experience; the job asks for {match.requiredYears ?? "no minimum"}. Duration is read from resume dates and is not independently confirmed unless evidence supports it.</p>
      </Card>
      <RequiredSkills match={match} onOpen={onOpen} />
      <Card>
        <CardHeader title="Project relevance" />
        {match.projects.length === 0 ? <Empty title="No projects on the resume" /> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {match.projects.map((p) => (
              <li key={p.name} className="flex items-start justify-between gap-4 px-5 py-3">
                <div><div className="font-medium">{p.name}</div><div className="text-xs text-slate-500">{p.reason}</div></div>
                <div className="shrink-0 text-right text-xs"><div className="font-semibold text-slate-700">{p.relevance} relevance</div><div className="text-slate-500">{p.verdict ? `claim ${p.verdict.toLowerCase()}` : "claim not checked"}</div></div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
