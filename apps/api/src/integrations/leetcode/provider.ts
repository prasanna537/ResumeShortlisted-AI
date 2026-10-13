export interface NormalizedLeetCodeProfile {
  username: string;
  problemsSolved?: number; // context only; not proof of professional skill
  languages: string[];
  categories: string[];
}

export interface LeetCodeDataProvider {
  readonly origin: "OFFICIAL_API" | "CANDIDATE_PROVIDED" | "EXPORT";
  getProfile(input: { profileUrl?: string; exportData?: unknown }): Promise<NormalizedLeetCodeProfile | null>;
}
