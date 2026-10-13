export type Verdict = "VERIFIED" | "PARTIAL" | "UNVERIFIED" | "CONTRADICTED";
export type MatchStatus = Verdict | "EVIDENCE_ONLY" | "NOT_FOUND";
export type AnalysisStatus =
  | "UPLOADED" | "PARSING" | "EXTRACTING_CLAIMS" | "COLLECTING_EVIDENCE" | "GENERATING_EMBEDDINGS"
  | "VERIFYING" | "MATCHING_JD" | "CALCULATING_SCORE" | "COMPLETED" | "FAILED";

export interface User { id: string; email: string; name: string }
export interface Requirement { id: string; kind: "REQUIRED" | "PREFERRED"; skill: string; canonicalSkill: string }
export interface Job {
  id: string; title: string; company: string | null; location: string | null; experienceYears: number | null;
  description: string; education: string | null; responsibilities: string[]; keywords: string[];
  status: "ACTIVE" | "CLOSED"; requirements: Requirement[]; _count?: { candidates: number }; createdAt: string;
}
export type VerdictCounts = Record<Verdict, number>;
export interface CandidateRow {
  id: string; name: string | null; email: string | null; job: { id: string; title: string };
  status: AnalysisStatus; matchScore: number | null; verification: VerdictCounts; decision: string | null; createdAt: string;
}
export interface AnalysisJob { id: string; status: AnalysisStatus; error: string | null; warnings: string[] | null; startedAt: string | null; finishedAt: string | null }
export interface ExternalProfile { id: string; provider: "GITHUB" | "LINKEDIN" | "LEETCODE"; url: string; username: string | null; origin: string; consentGiven: boolean; collectedAt: string | null; lastError: string | null }
export interface CandidateDetail {
  id: string; name: string | null; email: string | null; phone: string | null; consentGiven: boolean; recruiterNotes: string | null;
  job: { id: string; title: string; company: string | null };
  resumes: { id: string; fileName: string; sizeBytes: number; createdAt: string }[];
  externalProfiles: ExternalProfile[]; analysisJobs: AnalysisJob[];
  shortlist: { decision: "SHORTLISTED" | "REJECTED" | "REVIEW"; notes: string | null } | null;
  scores: Score[];
}
export interface Components { requiredSkill: number; verifiedExperience: number; projectRelevance: number; technicalEvidence: number; consistency: number }
export interface Score { id: string; overall: number; components: Components; weightsUsed: Components; explanation: string | null }
export interface EvidenceItem {
  id: string; source: "RESUME" | "GITHUB" | "LINKEDIN" | "LEETCODE"; sourceUrl: string | null; evidenceType: string;
  evidenceText: string; collectedAt: string; similarity?: number | null; metadata?: unknown;
}
export interface VerificationItem {
  id: string; claim: { id: string; claimText: string; category: string; sourceLocation: string | null; confidence: number };
  verdict: Verdict; confidence: number; reason: string; evidence: EvidenceItem[];
}
export interface RequirementMatch {
  requirementId: string; skill: string; kind: "REQUIRED" | "PREFERRED"; status: MatchStatus; value: number;
  via: string | null; claimId: string | null; evidenceIds: string[]; note: string;
}
export interface JdMatch {
  requirements: RequirementMatch[];
  projects: { name: string; relevance: string; verdict: Verdict | null; reason: string }[];
  subScores: { requiredSkillMatch: number; preferredSkillMatch: number | null; experienceYearsFactor: number; experienceVerificationFactor: number };
  claimedYears: number; requiredYears: number | null; components: Components; weights: Components; overall: number;
}
