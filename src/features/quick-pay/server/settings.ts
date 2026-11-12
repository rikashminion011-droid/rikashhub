import type { PrismaClient } from "@/generated/prisma/client";
import { ExpenseError, addAccount, addCategory, addPaymentMethod, archiveOption, kindOfAccount } from "@/features/expenses/server/service";
import type { MethodKind } from "@/features/expenses/types";
import { getKeywordEntries, getSettings } from "./prefs";
import type { BankOption, BankTreeNode, CategoryOption, CategoryTreeNode, PersonOption, QuickPayOptions } from "../types";

/** Banks (main files and the accounts under them), categories (main and sub), and the choices built from them. */

const arrow = (main: string, sub: string) => `${main} → ${sub}`;

function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new ExpenseError("Enter a name.");
  if (name.length > 60) throw new ExpenseError("Use at most 60 characters.");
  return name;
}

// ───────────────────────── Banks ─────────────────────────

export async function getBankTree(db: PrismaClient, userId: string): Promise<BankTreeNode[]> {
  const mains = await db.account.findMany({
    where: { userId, deletedAt: null, parentId: null },
    include: { children: { where: { deletedAt: null }, orderBy: [{ createdAt: "asc" }, { name: "asc" }] } },
    orderBy: [{ createdAt: "asc" }, { name: "asc" }],
  });
  return mains.map((m) => ({
    id: m.id,
    name: m.name,
    kind: kindOfAccount(m) as MethodKind,
    accounts: m.children.map((c) => ({ id: c.id, name: c.name })),
  }));
}

/** The banks you can choose in Quick Entry: every account under a main file, and any main file that has none. */
export function bankOptionsFrom(tree: readonly BankTreeNode[]): BankOption[] {
  return tree.flatMap((main) =>
    main.accounts.length === 0
      ? [{ id: main.id, label: main.name, mainName: main.name, name: main.name }]
      : main.accounts.map((a) => ({ id: a.id, label: arrow(main.name, a.name), mainName: main.name, name: a.name })),
  );
}

export const addBank = (db: PrismaClient, userId: string, input: { name: string; kind: MethodKind }) => addPaymentMethod(db, userId, input);
export const addSubBank = (db: PrismaClient, userId: string, input: { mainId: string; name: string }) =>
  addAccount(db, userId, { methodId: input.mainId, name: input.name });

/** Renames a main file or an account. History follows because entries point at the account, not at its name. */
export async function renameBank(db: PrismaClient, userId: string, input: { id: string; name: string }): Promise<void> {
  const name = cleanName(input.name);
  const account = await db.account.findFirst({ where: { id: input.id, userId, deletedAt: null } });
  if (!account) throw new ExpenseError("That bank no longer exists.", "NOT_FOUND");

  const clash = await db.account.findFirst({
    where: { userId, parentId: account.parentId, id: { not: account.id }, deletedAt: null, name: { equals: name, mode: "insensitive" } },
  });
  if (clash) throw new ExpenseError(`"${clash.name}" already exists${account.parentId ? " under the same file" : ""}.`, "CONFLICT");

  const updated = await db.account.updateMany({ where: { id: account.id, userId, deletedAt: null }, data: { name } });
  if (updated.count !== 1) throw new ExpenseError("That bank no longer exists.", "NOT_FOUND");
}

/** Removes a main file (with its accounts) or one account from the lists. Past entries keep their bank. */
export async function removeBank(db: PrismaClient, userId: string, input: { id: string }): Promise<void> {
  const account = await db.account.findFirst({ where: { id: input.id, userId, deletedAt: null }, select: { parentId: true } });
  if (!account) throw new ExpenseError("That bank no longer exists.", "NOT_FOUND");
  await archiveOption(db, userId, { kind: account.parentId ? "account" : "method", id: input.id });
}

// ───────────────────────── Categories ─────────────────────────

export async function getCategoryTree(db: PrismaClient, userId: string): Promise<CategoryTreeNode[]> {
  const mains = await db.transactionCategory.findMany({
    where: { userId, deletedAt: null, type: "EXPENSE", parentId: null },
    include: { children: { where: { deletedAt: null }, orderBy: [{ createdAt: "asc" }, { name: "asc" }] } },
    orderBy: [{ createdAt: "asc" }, { name: "asc" }],
  });
  return mains.map((m) => ({ id: m.id, name: m.name, keywords: m.keywords, subs: m.children.map((c) => ({ id: c.id, name: c.name, keywords: c.keywords })) }));
}

/** Every main category and every sub-category is selectable ("Food", "Food → Dosa"). */
export function categoryOptionsFrom(tree: readonly CategoryTreeNode[]): CategoryOption[] {
  return tree.flatMap((main) => [
    { id: main.id, label: main.name, mainName: main.name, name: main.name, isSub: false },
    ...main.subs.map((s) => ({ id: s.id, label: arrow(main.name, s.name), mainName: main.name, name: s.name, isSub: true })),
  ]);
}

export const addMainCategory = (db: PrismaClient, userId: string, input: { name: string }) => addCategory(db, userId, input);

export async function addSubCategory(db: PrismaClient, userId: string, input: { mainId: string; name: string }): Promise<string> {
  const name = cleanName(input.name);
  const main = await db.transactionCategory.findFirst({ where: { id: input.mainId, userId, type: "EXPENSE", parentId: null, deletedAt: null } });
  if (!main) throw new ExpenseError("That category no longer exists.", "NOT_FOUND");

  const existing = await db.transactionCategory.findFirst({
    where: { userId, type: "EXPENSE", parentId: main.id, name: { equals: name, mode: "insensitive" } },
  });
  if (existing && !existing.deletedAt) throw new ExpenseError(`"${existing.name}" already exists under ${main.name}.`, "CONFLICT");
  if (existing) {
    await db.transactionCategory.update({ where: { id: existing.id }, data: { deletedAt: null, createdAt: new Date() } });
    return existing.id;
  }
  return (await db.transactionCategory.create({ data: { userId, name, type: "EXPENSE", parentId: main.id, keywords: [] } })).id;
}

export async function renameCategory(db: PrismaClient, userId: string, input: { id: string; name: string }): Promise<void> {
  const name = cleanName(input.name);
  const category = await db.transactionCategory.findFirst({ where: { id: input.id, userId, deletedAt: null } });
  if (!category) throw new ExpenseError("That category no longer exists.", "NOT_FOUND");

  const clash = await db.transactionCategory.findFirst({
    where: { userId, type: category.type, parentId: category.parentId, id: { not: category.id }, name: { equals: name, mode: "insensitive" } },
  });
  if (clash) {
    throw new ExpenseError(
      clash.deletedAt ? `"${clash.name}" was removed earlier. Add it again to bring it back.` : `"${clash.name}" already exists.`,
      "CONFLICT",
    );
  }
  const updated = await db.transactionCategory.updateMany({ where: { id: category.id, userId, deletedAt: null }, data: { name } });
  if (updated.count !== 1) throw new ExpenseError("That category no longer exists.", "NOT_FOUND");
}

/** Removes a category (and, for a main one, its sub-categories) from the lists. Past entries keep it. */
export async function removeCategory(db: PrismaClient, userId: string, input: { id: string }): Promise<void> {
  const now = new Date();
  const count = await db.$transaction(async (tx) => {
    const result = await tx.transactionCategory.updateMany({ where: { id: input.id, userId, deletedAt: null }, data: { deletedAt: now } });
    if (result.count === 1) {
      await tx.transactionCategory.updateMany({ where: { parentId: input.id, userId, deletedAt: null }, data: { deletedAt: now } });
    }
    return result.count;
  });
  if (count !== 1) throw new ExpenseError("That category no longer exists.", "NOT_FOUND");
}

// ───────────────────────── Everything the entry forms need ─────────────────────────

export async function getQuickPayOptions(db: PrismaClient, userId: string): Promise<QuickPayOptions> {
  const [banks, categories, people] = await Promise.all([
    getBankTree(db, userId),
    getCategoryTree(db, userId),
    db.expenseParty.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: "asc" } }),
  ]);
  const persons: PersonOption[] = people.map((p) => ({ id: p.id, name: p.name }));
  const [settings, keywords] = await Promise.all([getSettings(db, userId), getKeywordEntries(db, userId)]);
  return { banks: bankOptionsFrom(banks), categories: categoryOptionsFrom(categories), persons, settings, keywords };
}
