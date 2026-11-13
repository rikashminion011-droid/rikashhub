import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ExpenseError } from "@/features/expenses/server/service";
import { MAX_KEYWORDS_PER_CATEGORY, MAX_KEYWORD_LENGTH, keywordKey, type KeywordEntry } from "../keywords";
import {
  DEFAULT_SETTINGS,
  SECTION_SCHEMAS,
  parseSettings,
  tidyPercents,
  type QuickPaySettingsData,
  type SettingsSection,
} from "../settings-model";

/** Saved Customized Settings (labels and defaults, Split, Credits Added) and the keywords that pick categories. */

export async function getSettings(db: PrismaClient, userId: string): Promise<QuickPaySettingsData> {
  const row = await db.quickPaySettings.findUnique({ where: { userId } });
  return row ? parseSettings(row.data) : DEFAULT_SETTINGS;
}

/** Checks that the bank, category and person a setting points at are yours and still exist. */
async function checkReferences(db: PrismaClient, userId: string, section: SettingsSection, value: QuickPaySettingsData[SettingsSection]): Promise<void> {
  if (section === "fields") {
    const { bankId, categoryId } = (value as QuickPaySettingsData["fields"]).defaults;
    if (bankId) {
      const bank = await db.account.findFirst({ where: { id: bankId, userId, deletedAt: null }, include: { children: { where: { deletedAt: null }, select: { id: true } } } });
      if (!bank) throw new ExpenseError("That default bank no longer exists.", "NOT_FOUND");
      if (bank.children.length > 0) throw new ExpenseError(`Choose one of the accounts under ${bank.name} as the default bank.`);
    }
    if (categoryId && !(await db.transactionCategory.findFirst({ where: { id: categoryId, userId, deletedAt: null }, select: { id: true } }))) {
      throw new ExpenseError("That default category no longer exists.", "NOT_FOUND");
    }
  }
  if (section === "split") {
    const { defaultPartyId } = value as QuickPaySettingsData["split"];
    if (defaultPartyId && !(await db.expenseParty.findFirst({ where: { id: defaultPartyId, userId, deletedAt: null }, select: { id: true } }))) {
      throw new ExpenseError("That default person no longer exists.", "NOT_FOUND");
    }
  }
}

/**
 * Saves one section of the settings (the others are left as they are). The section is validated here, whatever the
 * browser sent, and then everything that reads settings (Quick Entry, the edit pop-up, Add Bulk) uses it.
 */
export async function saveSettingsSection<K extends SettingsSection>(db: PrismaClient, userId: string, section: K, input: unknown): Promise<QuickPaySettingsData> {
  const parsed = SECTION_SCHEMAS[section].safeParse(input);
  if (!parsed.success) throw new ExpenseError(parsed.error.issues[0]?.message ?? "Check the settings and try again.");
  let value = parsed.data as QuickPaySettingsData[SettingsSection];

  if (section === "split") {
    const split = value as QuickPaySettingsData["split"];
    const options = tidyPercents(split.percentOptions);
    // The default percentage is always one of the choices, so the dropdown can show it selected.
    if (!options.includes(split.defaultPercent)) options.push(split.defaultPercent);
    value = { ...split, percentOptions: tidyPercents(options) };
  }
  if (section === "credits") {
    const credits = value as QuickPaySettingsData["credits"];
    value = { ...credits, customCount: Math.min(credits.customCount, credits.listSize) };
  }
  await checkReferences(db, userId, section, value);

  const current = await getSettings(db, userId);
  const next: QuickPaySettingsData = { ...current, [section]: value };
  await db.quickPaySettings.upsert({
    where: { userId },
    create: { userId, data: next as unknown as Prisma.InputJsonValue },
    update: { data: next as unknown as Prisma.InputJsonValue },
  });
  return next;
}

/** Puts a section back to its defaults. */
export const resetSettingsSection = (db: PrismaClient, userId: string, section: SettingsSection) => saveSettingsSection(db, userId, section, DEFAULT_SETTINGS[section]);

// ───────────────────────── Keywords ─────────────────────────

/** Every keyword with the category it picks, for categories still in your list. */
export async function getKeywordEntries(db: PrismaClient, userId: string): Promise<KeywordEntry[]> {
  const rows = await db.transactionCategory.findMany({ where: { userId, deletedAt: null, type: { in: ["EXPENSE", "INCOME"] } }, select: { id: true, keywords: true }, orderBy: [{ createdAt: "asc" }] });
  return rows.flatMap((r) => r.keywords.map((keyword) => ({ keyword, categoryId: r.id })));
}

/**
 * Sets the keywords of one category (replacing its list). A word can only point to one category: if another category
 * already uses it, the change is refused and says which, so a Reason never has two possible answers.
 */
export async function setCategoryKeywords(db: PrismaClient, userId: string, input: { categoryId: string; keywords: readonly string[] }): Promise<void> {
  const keys: string[] = [];
  for (const raw of input.keywords) {
    const key = keywordKey(raw);
    if (!key) continue;
    if (key.length > MAX_KEYWORD_LENGTH) throw new ExpenseError(`"${key.slice(0, 20)}…" is too long. Use at most ${MAX_KEYWORD_LENGTH} characters.`);
    if (!keys.includes(key)) keys.push(key);
  }
  if (keys.length > MAX_KEYWORDS_PER_CATEGORY) throw new ExpenseError(`At most ${MAX_KEYWORDS_PER_CATEGORY} keywords per category.`);

  await db.$transaction(async (tx) => {
    const category = await tx.transactionCategory.findFirst({ where: { id: input.categoryId, userId, deletedAt: null, type: { in: ["EXPENSE", "INCOME"] } } });
    if (!category) throw new ExpenseError("That category no longer exists.", "NOT_FOUND");

    // A word can only point to one category in the same list (Debit categories and Credit categories are separate lists).
    const others = await tx.transactionCategory.findMany({ where: { userId, deletedAt: null, type: category.type, id: { not: category.id } }, select: { name: true, keywords: true, parent: { select: { name: true } } } });
    for (const key of keys) {
      const clash = others.find((o) => o.keywords.includes(key));
      if (clash) throw new ExpenseError(`"${key}" already picks ${clash.parent ? `${clash.parent.name} → ${clash.name}` : clash.name}. Remove it there first.`, "CONFLICT");
    }
    await tx.transactionCategory.update({ where: { id: category.id }, data: { keywords: keys } });
  });
}
