import clsx from "clsx";

/** Progress bar with the value printed as text (never colour alone). `value` is 0..1. */
export function ScoreBar({ label, value, weight, hint }: { label: string; value: number; weight?: number; hint?: string }) {
  const p = Math.round(value * 100);
  return (
    <div title={hint}>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-slate-700">
          {label}
          {weight !== undefined && <span className="ml-1.5 text-xs text-slate-400">weight {Math.round(weight * 100)}%</span>}
        </span>
        <span className="font-semibold tabular-nums text-slate-900">{p}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={clsx("h-full rounded-full", p >= 75 ? "bg-brand-600" : p >= 50 ? "bg-brand-600/70" : "bg-slate-400")} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

export function OverallScore({ score }: { score: number | null }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white px-8 py-6">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Overall match</span>
      <span className="mt-1 text-5xl font-bold tabular-nums text-slate-900">{score === null ? "—" : `${Math.round(score)}%`}</span>
      <span className="mt-1 text-xs text-slate-500">Computed by application rules</span>
    </div>
  );
}
