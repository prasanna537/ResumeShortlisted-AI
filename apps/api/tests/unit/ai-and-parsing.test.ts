import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generateContent: vi.fn(), embedContent: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent, embedContent: mocks.embedContent };
  },
}));

import { AiError, generateStructured, geminiEmbeddings } from "../../src/ai/gemini";
import { jdSchema, claimsSchema, resumeSchema } from "../../src/ai/schemas";
import { parseJobDescription } from "../../src/services/jdParser";
import { assertPdf, extractPdfText } from "../../src/services/resumeService";
import { makePdf, resumeText } from "../fixtures/pdf";
import { candidates, sampleJd } from "../fixtures/candidates";
import { z } from "zod";

const reply = (text: string) => ({ text });
beforeEach(() => {
  mocks.generateContent.mockReset();
  mocks.embedContent.mockReset();
});

describe("structured AI output", () => {
  const schema = z.object({ a: z.number() });

  it("parses valid JSON, tolerating markdown fences", async () => {
    mocks.generateContent.mockResolvedValue(reply('```json\n{"a":1}\n```'));
    expect(await generateStructured(schema, "p")).toEqual({ a: 1 });
  });
  it("repairs JSON surrounded by prose", async () => {
    mocks.generateContent.mockResolvedValue(reply('Sure! {"a": 2} hope that helps'));
    expect(await generateStructured(schema, "p")).toEqual({ a: 2 });
  });
  it("retries once with feedback when the schema does not match", async () => {
    mocks.generateContent.mockResolvedValueOnce(reply('{"a":"nope"}')).mockResolvedValueOnce(reply('{"a":3}'));
    expect(await generateStructured(schema, "p")).toEqual({ a: 3 });
    expect(mocks.generateContent.mock.calls[1][0].contents).toContain("invalid");
  });
  it("fails gracefully (AiError) when the model keeps returning garbage", async () => {
    mocks.generateContent.mockResolvedValue(reply("not json at all"));
    await expect(generateStructured(schema, "p")).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });
  it("retries transient 503s", async () => {
    const e = Object.assign(new Error("UNAVAILABLE"), { status: 503 });
    mocks.generateContent.mockRejectedValueOnce(e).mockResolvedValueOnce(reply('{"a":4}'));
    expect(await generateStructured(schema, "p")).toEqual({ a: 4 });
  });
  it("reports rate limits with a friendly message and no secrets", async () => {
    mocks.generateContent.mockRejectedValue(Object.assign(new Error('{"error":{"status":"RESOURCE_EXHAUSTED"}} key=AIzaSECRET'), { status: 429 }));
    const err = await generateStructured(schema, "p").catch((x) => x);
    expect(err).toBeInstanceOf(AiError);
    expect(err.code).toBe("AI_RATE_LIMIT");
    expect(err.message).not.toMatch(/AIza/);
  });
}, 60_000);

describe("embeddings", () => {
  it("returns 768-d vectors and rejects wrong dimensions", async () => {
    mocks.embedContent.mockResolvedValueOnce({ embeddings: [{ values: new Array(768).fill(0.1) }] });
    expect((await geminiEmbeddings.embed(["x"]))[0]).toHaveLength(768);
    mocks.embedContent.mockResolvedValueOnce({ embeddings: [{ values: [1, 2, 3] }] });
    await expect(geminiEmbeddings.embed(["x"])).rejects.toBeInstanceOf(AiError);
  });
});

describe("JD extraction", () => {
  it("extracts structured requirements", async () => {
    mocks.generateContent.mockResolvedValue(reply(JSON.stringify(sampleJd.parsed)));
    const jd = await parseJobDescription(sampleJd.description);
    expect(jd.requiredSkills).toEqual(["React", "Node.js", "MongoDB", "REST API"]);
    expect(jd.experience.minimumYears).toBe(2);
  });
  it("never lists a skill as both required and preferred", async () => {
    mocks.generateContent.mockResolvedValue(reply(JSON.stringify({ ...sampleJd.parsed, preferredSkills: ["react", "AWS"] })));
    expect((await parseJobDescription("x".repeat(30))).preferredSkills).toEqual(["AWS"]);
  });
  it("schema defaults missing fields instead of crashing", () => {
    expect(jdSchema.parse({}).requiredSkills).toEqual([]);
  });
});

describe("resume + claim schemas", () => {
  it("normalizes empty strings to null and never invents values", () => {
    const r = resumeSchema.parse({ name: "  ", email: "", skills: ["React"] });
    expect(r.name).toBeNull();
    expect(r.email).toBeNull();
    expect(r.experience).toEqual([]);
  });
  it("coerces invalid claim category/confidence instead of failing", () => {
    const c = claimsSchema.parse({ claims: [{ claimText: "Candidate used React.", category: "WEIRD", confidence: 9 }] });
    expect(c.claims[0].category).toBe("OTHER");
    expect(c.claims[0].confidence).toBe(0.5);
  });
});

describe("resume PDF extraction", () => {
  it("extracts text from a valid PDF", async () => {
    const pdf = await makePdf(resumeText(candidates[0].resume));
    const text = await extractPdfText(pdf);
    expect(text).toContain("Strong Candidate");
    expect(text).toContain("React");
  });
  it("rejects non-PDF files, empty files and oversized files", () => {
    expect(() => assertPdf(Buffer.from("MZ not a pdf"))).toThrow(/PDF/);
    expect(() => assertPdf(Buffer.alloc(0))).toThrow(/empty/);
    expect(() => assertPdf(Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(6 * 1024 * 1024)]))).toThrow(/too large/);
  });
  it("rejects a corrupted PDF with a friendly message", async () => {
    await expect(extractPdfText(Buffer.from("%PDF-1.4 garbage garbage"))).rejects.toThrow(/could not be read|No readable text/);
  });
  it("rejects a PDF without readable text (e.g. scanned/empty)", async () => {
    const pdf = await makePdf(" ");
    await expect(extractPdfText(pdf)).rejects.toThrow(/No readable text/);
  });
});
