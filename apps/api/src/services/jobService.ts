import { prisma } from "../lib/prisma";
import { notFound } from "../utils/errors";
import { geminiEmbeddings } from "../ai/gemini";
import { setEmbedding } from "../lib/vector";
import { logger } from "../utils/logger";
import { canonicalSkill } from "./skillNormalizer";
import { parseJobDescription } from "./jdParser";

export interface JobInput {
  title: string;
  company?: string | null;
  location?: string | null;
  experienceYears?: number | null;
  description: string;
  status?: "ACTIVE" | "CLOSED";
}

/** Runs Gemini extraction and rewrites the job's structured requirements. */
async function extractAndStore(jobId: string, description: string, manualExperience?: number | null) {
  const parsed = await parseJobDescription(description);
  const rows = [
    ...parsed.requiredSkills.map((s) => ({ kind: "REQUIRED" as const, skill: s })),
    ...parsed.preferredSkills.map((s) => ({ kind: "PREFERRED" as const, skill: s })),
  ].map((r) => ({ ...r, canonicalSkill: canonicalSkill(r.skill), jobId }));

  await prisma.$transaction([
    prisma.jobRequirement.deleteMany({ where: { jobId } }),
    prisma.jobRequirement.createMany({ data: rows }),
    prisma.job.update({
      where: { id: jobId },
      data: {
        experienceYears: manualExperience ?? parsed.experience.minimumYears ?? null,
        education: parsed.education,
        responsibilities: parsed.responsibilities,
        keywords: parsed.keywords,
      },
    }),
  ]);

  // Embeddings are best-effort here; analysis re-checks and fills missing ones.
  try {
    await embedMissingRequirements(jobId);
  } catch (e) {
    logger.warn("requirement embedding deferred", { jobId, message: (e as Error).message });
  }
}

export async function embedMissingRequirements(jobId: string) {
  const missing = await prisma.$queryRaw<{ id: string; skill: string }[]>`
    SELECT "id", "skill" FROM "JobRequirement" WHERE "jobId" = ${jobId} AND "embedding" IS NULL`;
  if (!missing.length) return;
  const vecs = await geminiEmbeddings.embed(missing.map((m) => m.skill), "RETRIEVAL_QUERY");
  for (let i = 0; i < missing.length; i++) await setEmbedding("JobRequirement", missing[i].id, vecs[i]);
}

const include = { requirements: { orderBy: { kind: "asc" as const } }, _count: { select: { candidates: true } } };

export async function createJob(userId: string, input: JobInput) {
  const job = await prisma.job.create({
    data: {
      userId,
      title: input.title,
      company: input.company ?? null,
      location: input.location ?? null,
      experienceYears: input.experienceYears ?? null,
      description: input.description,
    },
  });
  // The job is saved even if AI extraction fails; the recruiter can retry via "re-extract" (PUT).
  let warning: string | undefined;
  try {
    await extractAndStore(job.id, input.description, input.experienceYears);
  } catch (e) {
    warning = `Job saved, but requirements could not be extracted automatically: ${(e as Error).message}`;
  }
  return { job: await getJob(userId, job.id), warning };
}

export const listJobs = (userId: string) =>
  prisma.job.findMany({ where: { userId }, include, orderBy: { createdAt: "desc" } });

export async function getJob(userId: string, id: string) {
  const job = await prisma.job.findFirst({ where: { id, userId }, include });
  if (!job) throw notFound("Job not found");
  return job;
}

export async function updateJob(userId: string, id: string, input: Partial<JobInput>, reextract: boolean) {
  const existing = await getJob(userId, id);
  await prisma.job.update({
    where: { id },
    data: {
      title: input.title,
      company: input.company,
      location: input.location,
      experienceYears: input.experienceYears,
      description: input.description,
      status: input.status,
    },
  });
  let warning: string | undefined;
  if (reextract || (input.description && input.description !== existing.description)) {
    try {
      await extractAndStore(id, input.description ?? existing.description, input.experienceYears);
    } catch (e) {
      warning = `Saved, but requirements could not be re-extracted: ${(e as Error).message}`;
    }
  }
  return { job: await getJob(userId, id), warning };
}

export async function deleteJob(userId: string, id: string) {
  await getJob(userId, id);
  await prisma.job.delete({ where: { id } });
}
