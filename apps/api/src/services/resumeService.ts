import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { extractText, getDocumentProxy } from "unpdf";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { badRequest } from "../utils/errors";
import { generateStructured } from "../ai/gemini";
import { claimExtractionPrompt, resumeStructuringPrompt, SAFETY } from "../ai/prompts";
import { claimsSchema, resumeSchema, type ParsedResume } from "../ai/schemas";
import { canonicalSkill } from "./skillNormalizer";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const UPLOAD_DIR = path.resolve(__dirname, "../../uploads");
const MIN_TEXT_CHARS = 80;

/** Validates PDF magic bytes (the client-sent MIME type is not trusted). */
export function assertPdf(buf: Buffer) {
  if (buf.length === 0) throw badRequest("The uploaded file is empty.");
  if (buf.length > MAX_RESUME_BYTES) throw badRequest("File is too large (max 5 MB).");
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw badRequest("Only PDF files are accepted.");
}

export async function extractPdfText(buf: Buffer): Promise<string> {
  assertPdf(buf);
  let text = "";
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    text = (await extractText(pdf, { mergePages: true })).text;
  } catch {
    throw badRequest("The PDF could not be read. It may be corrupted or password-protected.");
  }
  text = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (text.length < MIN_TEXT_CHARS) {
    throw badRequest(
      "No readable text was found in this PDF. It may be a scanned image (OCR is not enabled); please upload a text-based PDF.",
    );
  }
  return text;
}

export async function saveResume(candidateId: string, file: { buffer: Buffer; originalname: string; mimetype: string }) {
  const text = await extractPdfText(file.buffer);
  const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  // Server-generated name: the client filename is stored as metadata only, never used as a path.
  const storagePath = `${crypto.randomUUID()}.pdf`;
  await fs.writeFile(path.join(UPLOAD_DIR, storagePath), file.buffer);
  const safeName = file.originalname.replace(/[^\w.\- ]/g, "_").slice(0, 120);
  return prisma.resume.create({
    data: {
      candidateId,
      fileName: safeName,
      mimeType: "application/pdf",
      sizeBytes: file.buffer.length,
      fileHash: hash,
      storagePath,
      extractedText: text,
    },
  });
}

export async function structureResume(text: string): Promise<ParsedResume> {
  return generateStructured(resumeSchema, resumeStructuringPrompt(text.slice(0, 40_000)), SAFETY);
}

/** Extracts atomic claims and stores them (replacing earlier claims of the same resume). */
export async function extractAndStoreClaims(candidateId: string, resumeId: string, structured: ParsedResume) {
  const { claims } = await generateStructured(claimsSchema, claimExtractionPrompt(JSON.stringify(structured)), SAFETY);
  const seen = new Set<string>();
  const rows = claims
    .filter((c) => {
      const k = c.claimText.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 60)
    .map((c) => ({
      candidateId,
      resumeId,
      claimText: c.claimText.trim(),
      category: c.category,
      sourceLocation: c.sourceLocation ?? null,
      confidence: c.confidence,
      canonicalSkill: c.skill ? canonicalSkill(c.skill) : null,
    }));
  await prisma.resumeClaim.deleteMany({ where: { candidateId } });
  await prisma.resumeClaim.createMany({ data: rows });
  return rows.length;
}

export const asJson = (v: unknown) => v as Prisma.InputJsonValue;
