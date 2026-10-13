import clsx from "clsx";
import { Check, Loader2, XCircle } from "lucide-react";
import type { AnalysisStatus } from "@/types";

const STEPS: { key: AnalysisStatus; label: string }[] = [
  { key: "PARSING", label: "Parsing resume" },
  { key: "EXTRACTING_CLAIMS", label: "Extracting claims" },
  { key: "COLLECTING_EVIDENCE", label: "Collecting evidence" },
  { key: "GENERATING_EMBEDDINGS", label: "Generating embeddings" },
  { key: "VERIFYING", label: "Verifying claims" },
  { key: "MATCHING_JD", label: "Matching JD" },
  { key: "CALCULATING_SCORE", label: "Calculating score" },
];

export function AnalysisProgress({ status, error }: { status: AnalysisStatus; error?: string | null }) {
  const idx = STEPS.findIndex((s) => s.key === status);
  const done = status === "COMPLETED";
  const failed = status === "FAILED";
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-800">{done ? "Completed" : failed ? "Failed" : status === "UPLOADED" ? "Queued" : "Analysis in progress"}</span>
        {!done && !failed && <span className="text-slate-500">{Math.max(0, idx)} / {STEPS.length} steps</span>}
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => {
          const state = done || i < idx ? "done" : i === idx && !failed ? "active" : "todo";
          return (
            <li key={s.key} className={clsx("flex items-center gap-2 rounded-md border px-3 py-2 text-sm", state === "done" && "border-green-200 bg-green-50 text-green-900", state === "active" && "border-brand-600 bg-brand-50 text-brand-700", state === "todo" && "border-slate-200 text-slate-500")}>
              {state === "done" ? <Check className="h-4 w-4" aria-hidden /> : state === "active" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <span className="h-4 w-4 rounded-full border border-slate-300" aria-hidden />}
              {s.label}
            </li>
          );
        })}
      </ol>
      {failed && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error ?? "The analysis failed."} You can retry the analysis.</span>
        </div>
      )}
    </div>
  );
}
