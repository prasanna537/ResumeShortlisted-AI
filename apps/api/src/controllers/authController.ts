import type { Request, Response } from "express";
import { z } from "zod";
import * as auth from "../services/authService";
import { COOKIE, signToken } from "../middleware/auth";

const creds = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(8).max(200) });
const regSchema = creds.extend({ name: z.string().trim().min(1).max(100) });

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 864e5,
};

export async function register(req: Request, res: Response) {
  const { email, password, name } = regSchema.parse(req.body);
  const user = await auth.register(email, password, name);
  res.cookie(COOKIE, signToken(user.id), cookieOpts).status(201).json({ user });
}
export async function login(req: Request, res: Response) {
  const { email, password } = creds.parse(req.body);
  const user = await auth.login(email, password);
  res.cookie(COOKIE, signToken(user.id), cookieOpts).json({ user });
}
export async function logout(_req: Request, res: Response) {
  res.clearCookie(COOKIE).json({ ok: true });
}
export async function me(req: Request, res: Response) {
  res.json({ user: await auth.me(req.userId!) });
}
