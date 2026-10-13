/** Source-agnostic profile shape consumed by the verification engine. */
export interface NormalizedLinkedInProfile {
  headline: string;
  skills: string[];
  experience: { title: string; company?: string; start?: string; end?: string; description?: string }[];
  education: { school: string; degree?: string; field?: string }[];
  projects: { name: string; description?: string }[];
}

/**
 * Implementations must only use authorized API access or candidate-provided
 * export data. No scraping, login automation or anti-bot circumvention.
 */
export interface LinkedInDataProvider {
  readonly origin: "OFFICIAL_API" | "CANDIDATE_PROVIDED" | "EXPORT";
  getProfile(input: { profileUrl?: string; exportData?: unknown }): Promise<NormalizedLinkedInProfile | null>;
}
