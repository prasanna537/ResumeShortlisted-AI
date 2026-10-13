import type { ParsedResume } from "../../src/ai/schemas";
import type { CollectedRepo, GhUser } from "../../src/integrations/github/collector";

/** Offline test candidates. `mockVerdict` drives the fake LLM in integration tests. */
export interface FixtureClaim {
  claimText: string;
  category: "SKILL" | "EXPERIENCE" | "PROJECT" | "EDUCATION" | "CERTIFICATION" | "OTHER";
  skill: string | null;
  sourceLocation: string;
  confidence: number;
  mockVerdict: "VERIFIED" | "PARTIAL" | "UNVERIFIED" | "CONTRADICTED";
}
export interface FixtureCandidate {
  key: string;
  label: string;
  resume: ParsedResume;
  claims: FixtureClaim[];
  github: { user: GhUser; repos: CollectedRepo[] } | null;
  /** expected relative outcome */
  expect: { minOverall?: number; maxOverall?: number; contradicted?: number };
}

const repo = (name: string, description: string, languages: Record<string, number>, topics: string[], readme: string, created = "2023-01-10T00:00:00Z", pushed = "2024-11-01T00:00:00Z"): CollectedRepo => ({
  repo: {
    name,
    full_name: `fixture/${name}`,
    html_url: `https://github.com/fixture/${name}`,
    description,
    topics,
    fork: false,
    language: Object.keys(languages)[0] ?? null,
    created_at: created,
    pushed_at: pushed,
    updated_at: pushed,
    size: 100,
  },
  languages,
  readmeExcerpt: readme,
});
const ghUser = (login: string): GhUser => ({ login, name: login, bio: null, public_repos: 5, followers: 2, created_at: "2021-01-01T00:00:00Z", html_url: `https://github.com/${login}` });

const base = (over: Partial<ParsedResume>): ParsedResume => ({
  name: null, email: null, phone: null, skills: [], experience: [], education: [], projects: [], certifications: [],
  githubUrl: null, linkedinUrl: null, leetcodeUrl: null, ...over,
});

const mernRepos = [
  repo("ecommerce-frontend", "React storefront", { JavaScript: 90000, CSS: 8000 }, ["react", "ecommerce"], "React-based ecommerce frontend using Redux."),
  repo("ecommerce-api", "Node.js and Express REST API with MongoDB", { JavaScript: 70000 }, ["nodejs", "expressjs", "mongodb"], "REST API built with Node.js, Express and MongoDB."),
];

export const candidates: FixtureCandidate[] = [
  {
    key: "strong",
    label: "1. Strong genuine profile",
    resume: base({
      name: "Strong Candidate", email: "strong@example.test", skills: ["React", "Node.js", "MongoDB", "REST API", "AWS"],
      experience: [{ title: "Full Stack Developer", company: "Acme", startDate: "Jan 2021", endDate: "Present", description: "Built React and Node.js services with MongoDB." }],
      projects: [{ name: "E-commerce platform", description: "MERN e-commerce platform with REST API deployed on AWS", technologies: ["React", "Node.js", "MongoDB", "Express"] }],
      githubUrl: "https://github.com/fixture-strong",
    }),
    claims: [
      { claimText: "Candidate used React.", category: "SKILL", skill: "React", sourceLocation: "Skills", confidence: 0.95, mockVerdict: "VERIFIED" },
      { claimText: "Candidate used Node.js.", category: "SKILL", skill: "Node.js", sourceLocation: "Skills", confidence: 0.95, mockVerdict: "VERIFIED" },
      { claimText: "Candidate used MongoDB.", category: "SKILL", skill: "MongoDB", sourceLocation: "Skills", confidence: 0.95, mockVerdict: "VERIFIED" },
      { claimText: "Candidate built REST APIs.", category: "SKILL", skill: "REST API", sourceLocation: "Skills", confidence: 0.9, mockVerdict: "VERIFIED" },
      { claimText: "Candidate used AWS for deployment.", category: "SKILL", skill: "AWS", sourceLocation: "Projects: E-commerce platform", confidence: 0.8, mockVerdict: "PARTIAL" },
      { claimText: "Candidate has experience as Full Stack Developer at Acme.", category: "EXPERIENCE", skill: null, sourceLocation: "Experience: Acme", confidence: 0.9, mockVerdict: "PARTIAL" },
      { claimText: "Candidate developed an E-commerce platform project.", category: "PROJECT", skill: null, sourceLocation: "Projects: E-commerce platform", confidence: 0.9, mockVerdict: "VERIFIED" },
    ],
    github: { user: ghUser("fixture-strong"), repos: mernRepos },
    expect: { minOverall: 70, contradicted: 0 },
  },
  {
    key: "unsupported",
    label: "2. Resume with unsupported claims",
    resume: base({
      name: "Unsupported Claims", skills: ["React", "Node.js", "MongoDB", "REST API", "AWS", "Docker"],
      experience: [{ title: "Software Engineer", company: "Initech", startDate: "2020", endDate: "Present", description: "Worked with React, Node.js, AWS and Docker." }],
      projects: [{ name: "Cloud platform", description: "Microservices on AWS with Docker", technologies: ["AWS", "Docker"] }],
    }),
    claims: [
      { claimText: "Candidate used React.", category: "SKILL", skill: "React", sourceLocation: "Skills", confidence: 0.9, mockVerdict: "UNVERIFIED" },
      { claimText: "Candidate used Node.js.", category: "SKILL", skill: "Node.js", sourceLocation: "Skills", confidence: 0.9, mockVerdict: "UNVERIFIED" },
      { claimText: "Candidate used MongoDB.", category: "SKILL", skill: "MongoDB", sourceLocation: "Skills", confidence: 0.9, mockVerdict: "UNVERIFIED" },
      { claimText: "Candidate used AWS.", category: "SKILL", skill: "AWS", sourceLocation: "Skills", confidence: 0.9, mockVerdict: "UNVERIFIED" },
      { claimText: "Candidate used Docker.", category: "SKILL", skill: "Docker", sourceLocation: "Skills", confidence: 0.9, mockVerdict: "UNVERIFIED" },
      { claimText: "Candidate worked as Software Engineer at Initech.", category: "EXPERIENCE", skill: null, sourceLocation: "Experience: Initech", confidence: 0.9, mockVerdict: "UNVERIFIED" },
    ],
    github: null,
    expect: { maxOverall: 55, contradicted: 0 },
  },
  {
    key: "exaggerated",
    label: "3. Resume with exaggerated experience",
    resume: base({
      name: "Exaggerated Experience", skills: ["React", "Node.js", "MongoDB", "REST API"],
      experience: [{ title: "Senior Full Stack Developer", company: "Globex", startDate: "2015", endDate: "Present", description: "10 years of React experience." }],
      projects: [{ name: "Shop", description: "Online shop", technologies: ["React", "Node.js"] }],
      githubUrl: "https://github.com/fixture-exaggerated",
    }),
    claims: [
      { claimText: "Candidate has 10 years of React experience.", category: "EXPERIENCE", skill: "React", sourceLocation: "Experience: Globex", confidence: 0.9, mockVerdict: "PARTIAL" },
      { claimText: "Candidate used Node.js.", category: "SKILL", skill: "Node.js", sourceLocation: "Skills", confidence: 0.9, mockVerdict: "PARTIAL" },
      { claimText: "Candidate used MongoDB.", category: "SKILL", skill: "MongoDB", sourceLocation: "Skills", confidence: 0.9, mockVerdict: "UNVERIFIED" },
      { claimText: "Candidate built REST APIs.", category: "SKILL", skill: "REST API", sourceLocation: "Skills", confidence: 0.9, mockVerdict: "UNVERIFIED" },
    ],
    github: {
      user: ghUser("fixture-exaggerated"),
      repos: [repo("shop", "Small React shop", { JavaScript: 12000 }, ["react"], "A React demo shop.", "2024-06-01T00:00:00Z", "2024-08-01T00:00:00Z")],
    },
    expect: { maxOverall: 75, contradicted: 0 },
  },
  {
    key: "missing",
    label: "4. Resume with missing required skills",
    resume: base({
      name: "Missing Skills", skills: ["Java", "Spring", "MySQL"],
      experience: [{ title: "Backend Developer", company: "Hooli", startDate: "Mar 2019", endDate: "Present", description: "Java Spring services on MySQL." }],
      projects: [{ name: "Billing service", description: "Java Spring Boot billing service", technologies: ["Java", "Spring", "MySQL"] }],
      githubUrl: "https://github.com/fixture-missing",
    }),
    claims: [
      { claimText: "Candidate used Java.", category: "SKILL", skill: "Java", sourceLocation: "Skills", confidence: 0.95, mockVerdict: "VERIFIED" },
      { claimText: "Candidate used Spring.", category: "SKILL", skill: "Spring", sourceLocation: "Skills", confidence: 0.95, mockVerdict: "VERIFIED" },
      { claimText: "Candidate used MySQL.", category: "SKILL", skill: "MySQL", sourceLocation: "Skills", confidence: 0.95, mockVerdict: "VERIFIED" },
      { claimText: "Candidate has experience as Backend Developer at Hooli.", category: "EXPERIENCE", skill: null, sourceLocation: "Experience: Hooli", confidence: 0.9, mockVerdict: "PARTIAL" },
    ],
    github: {
      user: ghUser("fixture-missing"),
      repos: [repo("billing-service", "Java Spring Boot billing service backed by MySQL", { Java: 80000 }, ["java", "spring"], "Spring Boot service with MySQL.")],
    },
    expect: { maxOverall: 50, contradicted: 0 },
  },
  {
    key: "conflict",
    label: "5. Resume with conflicting information",
    resume: base({
      name: "Conflicting Info", skills: ["React", "Node.js", "MongoDB", "REST API"],
      experience: [
        { title: "Developer", company: "Umbrella", startDate: "2018", endDate: "2022", description: "React and Node.js development." },
        { title: "Developer", company: "Cyberdyne", startDate: "2019", endDate: "2023", description: "Overlapping role with React." },
      ],
      education: [{ institution: "State University", degree: "BSc", field: "Computer Science", year: "2025" }],
      githubUrl: "https://github.com/fixture-conflict",
    }),
    claims: [
      { claimText: "Candidate used React.", category: "SKILL", skill: "React", sourceLocation: "Skills", confidence: 0.9, mockVerdict: "VERIFIED" },
      { claimText: "Candidate used Node.js.", category: "SKILL", skill: "Node.js", sourceLocation: "Skills", confidence: 0.9, mockVerdict: "PARTIAL" },
      { claimText: "Candidate used MongoDB.", category: "SKILL", skill: "MongoDB", sourceLocation: "Skills", confidence: 0.9, mockVerdict: "UNVERIFIED" },
      { claimText: "Candidate worked at Umbrella from 2018 to 2022.", category: "EXPERIENCE", skill: null, sourceLocation: "Experience: Umbrella", confidence: 0.9, mockVerdict: "CONTRADICTED" },
      { claimText: "Candidate holds a BSc in Computer Science (2025).", category: "EDUCATION", skill: null, sourceLocation: "Education", confidence: 0.9, mockVerdict: "CONTRADICTED" },
    ],
    github: { user: ghUser("fixture-conflict"), repos: [mernRepos[0]] },
    expect: { maxOverall: 65, contradicted: 2 },
  },
];

export const sampleJd = {
  title: "Full Stack Developer",
  company: "Acme",
  description:
    "We are looking for a Full Stack Developer with React, Node.js, MongoDB and REST API experience. AWS is a plus. Minimum 2 years experience. Bachelors in Computer Science.",
  parsed: {
    requiredSkills: ["React", "Node.js", "MongoDB", "REST API"],
    preferredSkills: ["AWS"],
    experience: { minimumYears: 2 },
    education: "Bachelors in Computer Science",
    responsibilities: ["Build and maintain web applications"],
    keywords: ["full stack", "web"],
  },
};
