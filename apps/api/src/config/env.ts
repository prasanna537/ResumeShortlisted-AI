import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

// Load the repo-root .env (two levels up from apps/api).
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  GEMINI_API_KEY: z.string().default(""),
  // Optional comma-separated extra keys; calls rotate across all keys when one hits its quota.
  GEMINI_API_KEYS: z.string().default(""),
  GITHUB_TOKEN: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  GEMINI_MODEL: z.string().default("gemini-flash-latest"),
  GEMINI_FALLBACK_MODELS: z.string().default("gemini-3.5-flash,gemini-3.1-flash-lite,gemini-flash-lite-latest"),
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
  API_PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
});

export type Env = z.infer<typeof schema>;

/** All configured Gemini keys (GEMINI_API_KEY first, then GEMINI_API_KEYS), de-duplicated. */
export function geminiKeys(env: Pick<Env, "GEMINI_API_KEY" | "GEMINI_API_KEYS">): string[] {
  return [...new Set([env.GEMINI_API_KEY, ...env.GEMINI_API_KEYS.split(",")].map((k) => k.trim()).filter(Boolean))];
}

/** Returns the names of invalid/missing variables (never their values). */
export function envProblems(): string[] {
  const r = schema.safeParse(process.env);
  if (!r.success) return r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  return geminiKeys(r.data).length ? [] : ["GEMINI_API_KEY: set GEMINI_API_KEY or GEMINI_API_KEYS"];
}

export function loadEnv(): Env {
  const problems = envProblems();
  if (problems.length) throw new Error(`Invalid environment: ${problems.join("; ")}`);
  return schema.parse(process.env);
}
