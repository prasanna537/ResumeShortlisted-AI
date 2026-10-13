import clsx from "clsx";
import { AlertTriangle, CheckCircle2, CircleHelp, Info, MinusCircle, XCircle } from "lucide-react";
import type { ComponentType } from "react";
import type { AnalysisStatus, MatchStatus } from "@/types";

export const statusLabel = (s: AnalysisStatus) => (s === "COMPLETED" ? "Analyzed" : s === "FAILED" ? "Failed" : s === "UPLOADED" ? "Not analyzed" : "Processing");

/** Status is always conveyed by icon + text label as well as colour. */
const META: Record<MatchStatus, { label: string; symbol: string; Icon: ComponentType<{ className?: string }>; cls: string }> = {
  VERIFIED: { label: "VERIFIED", symbol: "✓", Icon: CheckCircle2, cls: "bg-green-50 text-green-800 ring-green-600/30" },
  PARTIAL: { label: "PARTIAL", symbol: "⚠", Icon: AlertTriangle, cls: "bg-yellow-50 text-yellow-800 ring-yellow-600/40" },
  UNVERIFIED: { label: "UNVERIFIED", symbol: "?", Icon: CircleHelp, cls: "bg-slate-100 text-slate-700 ring-slate-500/30" },
  CONTRADICTED: { label: "CONTRADICTED", symbol: "✗", Icon: XCircle, cls: "bg-red-50 text-red-800 ring-red-600/30" },
  EVIDENCE_ONLY: { label: "EVIDENCE ONLY", symbol: "i", Icon: Info, cls: "bg-sky-50 text-sky-800 ring-sky-600/30" },
  NOT_FOUND: { label: "NOT FOUND", symbol: "✗", Icon: MinusCircle, cls: "bg-slate-100 text-slate-600 ring-slate-400/30" },
};

export const statusSymbol = (s: MatchStatus) => META[s].symbol;

export function StatusBadge({ status, className }: { status: MatchStatus; className?: string }) {
  const m = META[status];
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", m.cls, className)}>
      <m.Icon className="h-3.5 w-3.5" aria-hidden />
      {m.label}
    </span>
  );
}

export function VerdictSummary({ counts }: { counts: Record<string, number> | undefined }) {
  if (!counts) return <span className="text-slate-400">—</span>;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return <span className="text-slate-400">—</span>;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700" title="Verified / Partial / Unverified / Contradicted">
      <span>✓ {counts.VERIFIED}</span>
      <span>⚠ {counts.PARTIAL}</span>
      <span>? {counts.UNVERIFIED}</span>
      <span>✗ {counts.CONTRADICTED}</span>
    </span>
  );
}
