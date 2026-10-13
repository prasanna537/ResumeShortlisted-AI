import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export const EMBEDDING_DIM = 768;
