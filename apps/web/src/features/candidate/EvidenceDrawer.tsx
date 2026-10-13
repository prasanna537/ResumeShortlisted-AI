"use client";
import { ExternalLink, X } from "lucide-react";
import { useEffect } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate, pct } from "@/components/ui";
import type { EvidenceItem, MatchStatus } from "@/types";

export interface DrawerData {
  kind: "claim" | "requirement";
  title: string;
  status: MatchStatus;
  confidence?: number;
  reason: string;
  evidence: EvidenceItem[];
  sourceLocation?: string | null;
}

const SOURCE_LABEL: Record<string, string> = { GITHUB: "GitHub", LINKEDIN: "LinkedIn", LEETCODE: "LeetCode", RESUME: "Resume (self-reported)" };

export function EvidenceDrawer({ data, onClose }: { data: DrawerData | null; onClose: () => void }) {
  useEffect(() => {
    if (!data) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [data, onClose]);
  if (!data) return null;

  return (
    <div className="no-print fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Evidence details">
      <button className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-label="Close evidence panel" />
      <div className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">{data.kind === "claim" ? "Claim evidence" : "Requirement evidence"}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-5 px-5 py-4 text-sm">
          <Section label={data.kind === "claim" ? "Claim" : "Requirement"}>
            <p className="text-base font-medium text-slate-900">&ldquo;{data.title}&rdquo;</p>
            {data.sourceLocation && <p className="mt-1 text-xs text-slate-500">Found in: {data.sourceLocation}</p>}
          </Section>
          <div className="flex gap-8">
            <Section label="Verdict"><StatusBadge status={data.status} /></Section>
            {data.confidence !== undefined && <Section label="Confidence"><span className="text-lg font-semibold tabular-nums">{pct(data.confidence)}</span></Section>}
          </div>
          <Section label="Explanation"><p className="text-slate-700">{data.reason}</p></Section>
          <Section label={`Evidence (${data.evidence.length})`}>
            {data.evidence.length === 0 ? (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-slate-600">No supporting evidence was found. This does not mean the claim is false; it means nothing available confirms it.</p>
            ) : (
              <ul className="space-y-3">
                {data.evidence.map((e) => (
                  <li key={e.id} className="rounded-md border border-slate-200 p-3">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span><strong className="text-slate-700">Source:</strong> {SOURCE_LABEL[e.source] ?? e.source} · {e.evidenceType.replace(/_/g, " ")}</span>
                      <span>Collected {fmtDate(e.collectedAt)}{e.similarity ? ` · relevance ${pct(e.similarity)}` : ""}</span>
                    </div>
                    <p className="text-slate-800">{e.evidenceText}</p>
                    {e.sourceUrl && (
                      <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                        <ExternalLink className="h-3 w-3" aria-hidden /> {e.sourceUrl}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    {children}
  </div>
);
