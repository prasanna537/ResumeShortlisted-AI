import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { geminiKeys, loadEnv } from "../config/env";
import { EMBEDDING_DIM } from "../lib/prisma";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";

// One client per configured key. `preferred` remembers the last key that worked so an exhausted key is not retried first.
const clients = new Map<string, GoogleGenAI>();
const clientFor = (key: string) => {
  let c = clients.get(key);
  if (!c) clients.set(key, (c = new GoogleGenAI({ apiKey: key })));
  return c;
};
let preferred = 0;

export class AiError extends AppError {
  constructor(message: string, code = "AI_ERROR") {
    super(502, message, code);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function classify(e: unknown): { retryable: boolean; delayMs?: number; message: string } {
  const msg = String((e as Error)?.message ?? e);
  const status = (e as { status?: number })?.status;
  const retryable = status === 429 || status === 503 || /RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded/i.test(msg);
  const m = msg.match(/retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/i);
  return { retryable, delayMs: m ? Math.ceil(parseFloat(m[1]) * 1000) : undefined, message: msg };
}

/**
 * Runs a Gemini call across every (model, API key) pair. On a quota/overload error (429/503) it moves on to the next
 * key, then the next model, and only sleeps once everything has been tried (up to 3 rounds).
 */
async function callGemini<T>(label: string, models: string[], run: (c: GoogleGenAI, model: string) => Promise<T>): Promise<T> {
  const keys = geminiKeys(loadEnv());
  const rounds = 3;
  let lastMsg = "";
  for (let round = 0; round < rounds; round++) {
    let shortest = Infinity;
    for (const model of models) {
      for (let n = 0; n < keys.length; n++) {
        const idx = (preferred + n) % keys.length;
        try {
          const out = await run(clientFor(keys[idx]), model);
          preferred = idx;
          return out;
        } catch (e) {
          const c = classify(e);
          lastMsg = c.message;
          const gone = /no longer available|not found|NOT_FOUND/i.test(c.message);
          if (!c.retryable && !gone) {
            // Genuine request error (bad input, invalid key): another model will not fix it, another key might.
            logger.warn(`Gemini ${label} error`, { model, key: idx + 1, status: (e as { status?: number }).status });
            continue;
          }
          shortest = Math.min(shortest, c.delayMs ?? 4000);
          logger.warn(`Gemini ${label} limited; trying next key/model`, { model, key: idx + 1, status: (e as { status?: number }).status });
        }
      }
    }
    if (round < rounds - 1 && shortest !== Infinity) {
      const wait = Math.min(shortest + 500, 65_000);
      logger.warn(`All Gemini keys/models busy for ${label}; waiting`, { round: round + 1, waitMs: wait });
      await sleep(wait);
    } else break;
  }
  logger.error(`Gemini ${label} failed`, { message: lastMsg.replace(/AIza[\w-]+/g, "[key]").slice(0, 400) });
  const limited = /429|RESOURCE_EXHAUSTED/i.test(lastMsg);
  throw new AiError(
    limited ? "The AI service is rate-limited right now. Please retry in a few minutes." : "The AI service request failed. Please retry.",
    limited ? "AI_RATE_LIMIT" : "AI_ERROR",
  );
}

/** Embedding provider interface so the backing model can be swapped later. */
export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY";
export interface EmbeddingService {
  embed(texts: string[], task?: EmbedTask): Promise<number[][]>;
}

const BATCH = 100;

export const geminiEmbeddings: EmbeddingService = {
  async embed(texts, task = "SEMANTIC_SIMILARITY") {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const chunk = texts.slice(i, i + BATCH);
      const res = await callGemini("embed", [loadEnv().GEMINI_EMBEDDING_MODEL], (c, model) =>
        c.models.embedContent({ model, contents: chunk, config: { outputDimensionality: EMBEDDING_DIM, taskType: task } }),
      );
      const vecs = (res.embeddings ?? []).map((e) => e.values ?? []);
      if (vecs.length !== chunk.length || vecs.some((v) => v.length !== EMBEDDING_DIM)) {
        throw new AiError("Embedding service returned an unexpected result.", "EMBEDDING_ERROR");
      }
      out.push(...vecs);
    }
    return out;
  },
};

/** Raw JSON-mode generation: GEMINI_MODEL then GEMINI_FALLBACK_MODELS, each tried with every API key. */
export async function generateJson(prompt: string, system?: string): Promise<string> {
  const env = loadEnv();
  const models = [env.GEMINI_MODEL, ...env.GEMINI_FALLBACK_MODELS.split(",").map((m) => m.trim()).filter(Boolean)];
  const res = await callGemini("generate", models, (c, model) =>
    c.models.generateContent({ model, contents: prompt, config: { systemInstruction: system, responseMimeType: "application/json", temperature: 0 } }),
  );
  return res.text ?? "";
}

function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    // Safe repair: take the outermost {...} or [...] block only.
    const s = Math.min(...["{", "["].map((c) => (t.indexOf(c) === -1 ? Infinity : t.indexOf(c))));
    const e = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (s !== Infinity && e > s) return JSON.parse(t.slice(s, e + 1));
    throw new Error("no JSON found");
  }
}

/** Generates JSON and validates it against a zod schema; retries once with the validation error. */
export async function generateStructured<S extends z.ZodTypeAny>(
  schema: S,
  prompt: string,
  system?: string,
): Promise<z.infer<S>> {
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await generateJson(prompt + feedback, system);
    try {
      return schema.parse(extractJson(text));
    } catch (e) {
      const why = e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : "not valid JSON";
      feedback = `\n\nYour previous reply was invalid (${why}). Reply again with ONLY valid JSON matching the required shape.`;
    }
  }
  throw new AiError("The AI returned an invalid response. Please retry.", "AI_INVALID_RESPONSE");
}
