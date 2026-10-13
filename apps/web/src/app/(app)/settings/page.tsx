"use client";
import { Card, CardHeader, PageHeader } from "@/components/ui";

const WEIGHTS: [string, number][] = [["JD required skill match", 40], ["Verified experience", 20], ["Project relevance", 15], ["Technical evidence", 15], ["Resume consistency", 10]];

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="How ResumeVerify scores and handles data." />
      <div className="grid max-w-4xl gap-4">
        <Card>
          <CardHeader title="Scoring weights (global defaults)" />
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-slate-100">{WEIGHTS.map(([k, v]) => <tr key={k}><td className="px-5 py-2">{k}</td><td className="px-5 py-2 text-right tabular-nums">{v}%</td></tr>)}</tbody>
          </table>
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Weights are fixed in this version and applied to every job. Scores are computed by application rules; the AI never produces a number.</p>
        </Card>
        <Card>
          <CardHeader title="Verdicts" />
          <ul className="space-y-1.5 px-5 py-4 text-sm text-slate-700">
            <li><strong>VERIFIED</strong>: strong independent evidence supports the claim.</li>
            <li><strong>PARTIAL</strong>: evidence supports part of the claim; details such as duration are missing.</li>
            <li><strong>UNVERIFIED</strong>: no reliable evidence found. This does not mean the claim is false.</li>
            <li><strong>CONTRADICTED</strong>: reliable evidence conflicts with the claim.</li>
          </ul>
        </Card>
        <Card>
          <CardHeader title="Privacy and fairness" />
          <ul className="list-disc space-y-1.5 px-9 py-4 text-sm text-slate-700">
            <li>External data is collected only for candidates whose consent you record, from GitHub&apos;s official public API.</li>
            <li>LinkedIn and LeetCode data is used only when candidate-provided; nothing is scraped and no protections are bypassed.</li>
            <li>Protected or sensitive attributes are never used for scoring or ranking.</li>
            <li>Nothing is rejected automatically. Every shortlist or reject decision is yours.</li>
            <li>You can delete a candidate and all derived data from the candidate page.</li>
            <li>Resume text is sent to Google Gemini for extraction and reasoning. Make sure this fits your candidate privacy notice.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
