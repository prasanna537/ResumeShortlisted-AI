import { envProblems } from "../config/env";
import { prisma } from "../lib/prisma";
import { geminiEmbeddings } from "../ai/gemini";
import { githubGet } from "../integrations/github/client";

async function step(name: string, fn: () => Promise<string>) {
  try {
    console.log(`OK    ${name}: ${await fn()}`);
  } catch (e) {
    console.log(`FAIL  ${name}: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

(async () => {
  const problems = envProblems();
  if (problems.length) {
    console.log("FAIL  env:\n  " + problems.join("\n  "));
    process.exit(1);
  }
  console.log("OK    env: all required variables present");
  await step("postgres", async () => {
    await prisma.$queryRaw`SELECT 1`;
    const r = await prisma.$queryRaw<{ extname: string }[]>`SELECT extname FROM pg_extension WHERE extname='vector'`;
    return r.length ? "connected, pgvector enabled" : "connected, pgvector MISSING";
  });
  await step("gemini embeddings", async () => `dim=${(await geminiEmbeddings.embed(["hello"]))[0].length}`);
  await step("github token", async () => {
    const r = await githubGet<{ login: string }>("/user");
    return `authenticated`;
  });
  await prisma.$disconnect();
})();
