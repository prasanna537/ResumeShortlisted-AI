/** Live end-to-end check against the real Gemini + GitHub APIs: npm run smoke:live (uses GitHub's demo user "octocat"). */
import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import { makePdf } from "../../tests/fixtures/pdf";
import request from "supertest";

const text = `Jane Demo
jane.demo@example.test
SKILLS: React, Node.js, MongoDB, REST API, Docker, Ruby
EXPERIENCE: Full Stack Developer at Acme (Jan 2021 - Present). Built a MERN e-commerce platform using React, Node.js, Express and MongoDB, deployed on AWS.
PROJECT Hello World: Open source demo repository work on GitHub.
EDUCATION: BSc Computer Science, State University, 2020
GitHub: https://github.com/octocat`;

(async () => {
  const H = { "X-Requested-With": "ResumeVerify" };
  const agent = request.agent(createApp());
  const email = `live-${Date.now()}@example.test`;
  await agent.post("/api/auth/register").set(H).send({ email, password: "password123", name: "Live" });
  const job = await agent.post("/api/jobs").set(H).send({ title: "Full Stack Developer", description: "We need a Full Stack Developer with React, Node.js, MongoDB and REST API experience. AWS is a plus. Minimum 2 years experience." });
  console.log("JD:", job.body.warning ?? "ok", job.body.job.requirements.map((r: { skill: string; kind: string }) => `${r.kind[0]}:${r.skill}`).join(", "));
  const c = await agent.post("/api/candidates").set(H).send({ jobId: job.body.job.id, consentGiven: true });
  const id = c.body.candidate.id;
  console.log("upload:", (await agent.post(`/api/candidates/${id}/resume`).set(H).attach("file", await makePdf(text), "r.pdf")).status);
  console.log("analyze:", (await agent.post(`/api/candidates/${id}/analyze`).set(H)).status);
  let last = "";
  for (let i = 0; i < 400; i++) {
    const a = (await agent.get(`/api/candidates/${id}/analysis`)).body.analysis;
    if (a.status !== last) console.log("  stage:", a.status), (last = a.status);
    if (a.status === "COMPLETED" || a.status === "FAILED") {
      console.log("warnings:", JSON.stringify(a.warnings), "error:", a.error);
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  const v = await agent.get(`/api/candidates/${id}/verification`);
  console.log("summary:", JSON.stringify(v.body.summary));
  for (const r of v.body.results) console.log(` - [${r.verdict} ${Math.round(r.confidence * 100)}%] ${r.claim.claimText} (evidence: ${r.evidence.length}) :: ${r.reason.slice(0, 110)}`);
  const s = await agent.get(`/api/candidates/${id}/score`);
  console.log("score:", s.body.score?.overall, JSON.stringify(s.body.score?.components));
  console.log("explanation:", s.body.score?.explanation);
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
})();
