import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/errors";

const publicUser = (u: { id: string; email: string; name: string }) => ({ id: u.id, email: u.email, name: u.name });

export async function register(email: string, password: string, name: string) {
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new AppError(409, "An account with this email already exists.", "CONFLICT");
  const user = await prisma.user.create({ data: { email, name, passwordHash: await bcrypt.hash(password, 12) } });
  return publicUser(user);
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Same message for unknown email and wrong password.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, "Invalid email or password.", "UNAUTHORIZED");
  }
  return publicUser(user);
}

export async function me(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(401, "Account not found.", "UNAUTHORIZED");
  return publicUser(user);
}
