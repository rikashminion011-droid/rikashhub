import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ExpenseError } from "@/features/expenses/server/service";
import { DEFAULT_LAYOUT, layoutSchema, normalizeLayout, type NavLayout } from "../model";

/** Loads and saves a user's side navigator layout. Every read and write is scoped to `userId`. */

export async function getNavLayout(db: PrismaClient, userId: string): Promise<NavLayout> {
  const row = await db.navigationSettings.findUnique({ where: { userId } });
  return row ? normalizeLayout(row.data) : structuredClone(DEFAULT_LAYOUT);
}

/**
 * Saves a layout. It is checked and tidied here whatever the browser sent, so a bad request can never leave the navigator
 * unusable. Returns what was actually saved.
 */
export async function saveNavLayout(db: PrismaClient, userId: string, input: unknown): Promise<NavLayout> {
  const parsed = layoutSchema.safeParse(input);
  if (!parsed.success) throw new ExpenseError(parsed.error.issues[0]?.message ?? "That layout could not be read.");
  const layout = normalizeLayout(parsed.data);
  const data = layout as unknown as Prisma.InputJsonValue;
  await db.navigationSettings.upsert({ where: { userId }, create: { userId, data }, update: { data } });
  return layout;
}

/** Back to the built-in layout. */
export async function resetNavLayout(db: PrismaClient, userId: string): Promise<NavLayout> {
  await db.navigationSettings.deleteMany({ where: { userId } });
  return structuredClone(DEFAULT_LAYOUT);
}
