import { Prisma } from "@prisma/client";
import { prisma, EMBEDDING_DIM } from "./prisma";

export const toVectorLiteral = (v: number[]) => `[${v.join(",")}]`;

type VectorTable = "Evidence" | "ResumeClaim" | "JobRequirement";

/** Stores an embedding in a pgvector column (Prisma cannot write Unsupported types directly). */
export async function setEmbedding(table: VectorTable, id: string, vec: number[]) {
  if (vec.length !== EMBEDDING_DIM) throw new Error("bad embedding dimension");
  const lit = toVectorLiteral(vec);
  // Table name comes from the closed VectorTable union, never user input.
  await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "embedding" = $1::vector WHERE "id" = $2`, lit, id);
}

export interface SimilarEvidence {
  id: string;
  similarity: number;
}

/** Top-k evidence for a candidate by cosine similarity to a claim/requirement embedding. */
export async function similarEvidence(candidateId: string, queryVec: number[], k = 6, minSimilarity = 0.45) {
  const lit = toVectorLiteral(queryVec);
  const rows = await prisma.$queryRaw<SimilarEvidence[]>(Prisma.sql`
    SELECT "id", 1 - ("embedding" <=> ${lit}::vector) AS similarity
    FROM "Evidence"
    WHERE "candidateId" = ${candidateId} AND "embedding" IS NOT NULL
    ORDER BY "embedding" <=> ${lit}::vector
    LIMIT ${k}`);
  return rows.map((r) => ({ id: r.id, similarity: Number(r.similarity) })).filter((r) => r.similarity >= minSimilarity);
}

export async function getEmbedding(table: VectorTable, id: string): Promise<number[] | null> {
  const rows = await prisma.$queryRawUnsafe<{ e: string | null }[]>(`SELECT "embedding"::text AS e FROM "${table}" WHERE "id" = $1`, id);
  const e = rows[0]?.e;
  return e ? (JSON.parse(e) as number[]) : null;
}
