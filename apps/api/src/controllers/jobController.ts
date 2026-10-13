import type { Request, Response } from "express";
import { z } from "zod";
import * as jobs from "../services/jobService";

const base = z.object({
  title: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).nullish(),
  location: z.string().trim().max(200).nullish(),
  experienceYears: z.number().min(0).max(60).nullish(),
  description: z.string().trim().min(20, "Paste the job description (at least 20 characters)").max(30_000),
});
const updateSchema = base.partial().extend({
  status: z.enum(["ACTIVE", "CLOSED"]).optional(),
  reextract: z.boolean().optional(),
});

const id = (req: Request) => z.string().uuid().parse(req.params.id);

export async function create(req: Request, res: Response) {
  res.status(201).json(await jobs.createJob(req.userId!, base.parse(req.body)));
}
export async function list(req: Request, res: Response) {
  res.json({ jobs: await jobs.listJobs(req.userId!) });
}
export async function get(req: Request, res: Response) {
  res.json({ job: await jobs.getJob(req.userId!, id(req)) });
}
export async function update(req: Request, res: Response) {
  const { reextract, ...data } = updateSchema.parse(req.body);
  res.json(await jobs.updateJob(req.userId!, id(req), data, !!reextract));
}
export async function remove(req: Request, res: Response) {
  await jobs.deleteJob(req.userId!, id(req));
  res.json({ ok: true });
}
