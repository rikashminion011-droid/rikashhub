import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ExpenseError } from "@/features/expenses/server/service";
import { rangeToInstants } from "@/features/quick-pay/datetime";
import { divideEvenly, paiseToDecimalString, toPaise } from "@/lib/finance";

/**
 * Shopping Records: platforms (D Mart, AP Supermarket...), the purchases made on them, and each purchase's item table.
 * Every read and write is scoped to `userId`. A purchase is Pending until it has an image, recipients and a saved item table.
 */

export const DEFAULT_PLATFORMS = ["D Mart", "AP Supermarket"] as const;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_PAISE = 99_999_999_99;

const paiseOf = (d: { toString(): string }) => toPaise(d.toString());
const keyOf = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const cleanName = (raw: string) => {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new ExpenseError("Enter a name.");
  if (name.length > 60) throw new ExpenseError("Use at most 60 characters.");
  return name;
};

export interface PlatformRow {
  id: string;
  name: string;
}

export interface PurchaseRow {
  id: string;
  platformId: string;
  platformName: string;
  /** The place of this purchase among its platform's purchases, oldest first (the 3 of "D Mart 3"). */
  number: number;
  occurredAt: string;
  reason: string;
  amountPaise: number;
  recipientIds: string[];
  hasImage: boolean;
  detailsSaved: boolean;
  /** True until the image, the recipients and the item table are all filled in. */
  pending: boolean;
  source: "MANUAL" | "QUICK_ENTRY";
}

export interface ItemRow {
  name: string;
  /** Up to 3 decimals, as typed. */
  quantity: number;
  ratePaise: number;
  totalPaise: number;
  recipientIds: string[];
}

export interface PurchaseDetail extends PurchaseRow {
  items: ItemRow[];
}

export interface PurchaseInput {
  platformId: string;
  occurredAt: Date;
  reason: string;
  amountPaise: number;
  recipientIds: string[];
}

// ───────────────────────── Platforms ─────────────────────────

export async function listPlatforms(db: PrismaClient, userId: string): Promise<PlatformRow[]> {
  const everMade = await db.shoppingPlatform.count({ where: { userId } });
  if (everMade === 0) {
    const start = Date.now();
    await db.shoppingPlatform.createMany({ data: DEFAULT_PLATFORMS.map((name, i) => ({ userId, name, nameKey: keyOf(name), createdAt: new Date(start + i) })), skipDuplicates: true });
  }
  const rows = await db.shoppingPlatform.findMany({ where: { userId, deletedAt: null }, orderBy: [{ createdAt: "asc" }, { name: "asc" }] });
  return rows.map((p) => ({ id: p.id, name: p.name }));
}

export async function addPlatform(db: PrismaClient, userId: string, name: string): Promise<string> {
  const clean = cleanName(name);
  const existing = await db.shoppingPlatform.findUnique({ where: { userId_nameKey: { userId, nameKey: keyOf(clean) } } });
  if (existing && !existing.deletedAt) throw new ExpenseError(`"${existing.name}" already exists.`, "CONFLICT");
  if (existing) {
    await db.shoppingPlatform.update({ where: { id: existing.id }, data: { deletedAt: null, name: clean } });
    return existing.id;
  }
  return (await db.shoppingPlatform.create({ data: { userId, name: clean, nameKey: keyOf(clean) } })).id;
}

export async function renamePlatform(db: PrismaClient, userId: string, id: string, name: string): Promise<void> {
  const clean = cleanName(name);
  const clash = await db.shoppingPlatform.findFirst({ where: { userId, nameKey: keyOf(clean), id: { not: id } } });
  if (clash) throw new ExpenseError(`"${clash.name}" already exists.`, "CONFLICT");
  const done = await db.shoppingPlatform.updateMany({ where: { id, userId, deletedAt: null }, data: { name: clean, nameKey: keyOf(clean) } });
  if (done.count !== 1) throw new ExpenseError("That platform no longer exists.", "NOT_FOUND");
}

/** Hides a platform. Its purchases are kept, and they return if the platform is added again. */
export async function removePlatform(db: PrismaClient, userId: string, id: string): Promise<void> {
  const done = await db.shoppingPlatform.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (done.count !== 1) throw new ExpenseError("That platform no longer exists.", "NOT_FOUND");
}

async function requirePlatform(db: Pick<PrismaClient, "shoppingPlatform">, userId: string, id: string) {
  const platform = await db.shoppingPlatform.findFirst({ where: { id, userId, deletedAt: null } });
  if (!platform) throw new ExpenseError("That platform no longer exists.", "NOT_FOUND");
  return platform;
}

async function checkRecipients(db: Pick<PrismaClient, "expenseParty">, userId: string, ids: readonly string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const found = await db.expenseParty.count({ where: { id: { in: unique }, userId, deletedAt: null } });
  if (found !== unique.length) throw new ExpenseError("A selected person no longer exists. Pick again.", "NOT_FOUND");
}

function checkInput(input: PurchaseInput) {
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) throw new ExpenseError("Enter an amount above zero (at most 2 decimals).");
  if (input.amountPaise > MAX_PAISE) throw new ExpenseError("That amount is too large.");
  if (!input.reason.trim()) throw new ExpenseError("Enter a reason.");
  if (input.reason.length > 300) throw new ExpenseError("Use at most 300 characters for the reason.");
}

// ───────────────────────── Purchases ─────────────────────────

type Row = Prisma.ShoppingPurchaseGetPayload<{ select: { id: true; platformId: true; occurredAt: true; reason: true; amount: true; recipientIds: true; imageType: true; detailsSaved: true; source: true } }>;

const SELECT = { id: true, platformId: true, occurredAt: true, reason: true, amount: true, recipientIds: true, imageType: true, detailsSaved: true, source: true } as const;

function toRow(r: Row, platformName: string, number: number): PurchaseRow {
  const hasImage = r.imageType !== null;
  return {
    id: r.id,
    platformId: r.platformId,
    platformName,
    number,
    occurredAt: r.occurredAt.toISOString(),
    reason: r.reason,
    amountPaise: paiseOf(r.amount),
    recipientIds: r.recipientIds,
    hasImage,
    detailsSaved: r.detailsSaved,
    pending: !r.detailsSaved || !hasImage || r.recipientIds.length === 0,
    source: r.source === "QUICK_ENTRY" ? "QUICK_ENTRY" : "MANUAL",
  };
}

/** Each purchase's place among its platform's purchases, oldest first. An older purchase added later shifts the numbers. */
async function numbering(db: PrismaClient, userId: string): Promise<{ numbers: Map<string, number>; names: Map<string, string> }> {
  const [all, platforms] = await Promise.all([
    db.shoppingPurchase.findMany({ where: { userId, deletedAt: null }, select: { id: true, platformId: true }, orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }, { id: "asc" }] }),
    db.shoppingPlatform.findMany({ where: { userId }, select: { id: true, name: true } }),
  ]);
  const count = new Map<string, number>();
  const numbers = new Map<string, number>();
  for (const p of all) {
    const n = (count.get(p.platformId) ?? 0) + 1;
    count.set(p.platformId, n);
    numbers.set(p.id, n);
  }
  return { numbers, names: new Map(platforms.map((p) => [p.id, p.name])) };
}

export async function listPurchases(
  db: PrismaClient,
  userId: string,
  filter: { platformId: string | null; from: string | null; to: string | null; pendingOnly: boolean },
): Promise<{ rows: PurchaseRow[]; totalPaise: number; pendingCount: number }> {
  const bounds = rangeToInstants(filter.from, filter.to);
  const when: Prisma.DateTimeFilter | undefined = bounds.gte || bounds.lt ? bounds : undefined;
  const livePlatforms = await db.shoppingPlatform.findMany({ where: { userId, deletedAt: null }, select: { id: true } });
  const platformWhere = filter.platformId ? { platformId: filter.platformId } : { platformId: { in: livePlatforms.map((p) => p.id) } };
  const [rows, { numbers, names }, pendingRows] = await Promise.all([
    db.shoppingPurchase.findMany({ where: { userId, deletedAt: null, ...platformWhere, ...(when ? { occurredAt: when } : {}) }, select: SELECT, orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }, { id: "asc" }] }),
    numbering(db, userId),
    db.shoppingPurchase.findMany({ where: { userId, deletedAt: null, ...platformWhere }, select: SELECT }),
  ]);
  const all = rows.map((r) => toRow(r, names.get(r.platformId) ?? "", numbers.get(r.id) ?? 0));
  const pendingCount = pendingRows.map((r) => toRow(r, "", 0)).filter((r) => r.pending).length;
  const shown = filter.pendingOnly ? all.filter((r) => r.pending) : all;
  return { rows: shown, totalPaise: shown.reduce((s, r) => s + r.amountPaise, 0), pendingCount };
}

export async function createPurchase(db: PrismaClient, userId: string, key: string, input: PurchaseInput): Promise<{ id: string; duplicate: boolean }> {
  checkInput(input);
  await requirePlatform(db, userId, input.platformId);
  await checkRecipients(db, userId, input.recipientIds);
  const dedupeKey = `manual:${key}`;
  const existing = await db.shoppingPurchase.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey } } });
  if (existing) return { id: existing.id, duplicate: true };
  const created = await db.shoppingPurchase.create({
    data: { userId, platformId: input.platformId, occurredAt: input.occurredAt, reason: input.reason.trim(), amount: paiseToDecimalString(input.amountPaise), recipientIds: [...new Set(input.recipientIds)], dedupeKey },
  });
  return { id: created.id, duplicate: false };
}

/**
 * The record a Shopping Portal transaction in Quick Entry makes: date, reason and amount are carried over, and it is Pending until
 * the rest is added. Calling it twice for the same transaction returns the same record.
 */
export async function createFromQuickEntry(db: PrismaClient, userId: string, transactionId: string, input: Omit<PurchaseInput, "recipientIds"> & { recipientIds?: string[] }): Promise<{ id: string; duplicate: boolean }> {
  const full = { ...input, recipientIds: input.recipientIds ?? [] };
  checkInput(full);
  await requirePlatform(db, userId, full.platformId);
  const existing = await db.shoppingPurchase.findUnique({ where: { userId_transactionId: { userId, transactionId } } });
  if (existing) {
    if (existing.deletedAt) await db.shoppingPurchase.update({ where: { id: existing.id }, data: { deletedAt: null } });
    return { id: existing.id, duplicate: true };
  }
  const created = await db.shoppingPurchase.create({
    data: { userId, platformId: full.platformId, occurredAt: full.occurredAt, reason: full.reason.trim(), amount: paiseToDecimalString(full.amountPaise), recipientIds: full.recipientIds, source: "QUICK_ENTRY", transactionId },
  });
  return { id: created.id, duplicate: false };
}

export async function updatePurchase(db: PrismaClient, userId: string, id: string, input: PurchaseInput): Promise<void> {
  checkInput(input);
  await requirePlatform(db, userId, input.platformId);
  await checkRecipients(db, userId, input.recipientIds);
  const done = await db.shoppingPurchase.updateMany({
    where: { id, userId, deletedAt: null },
    data: { platformId: input.platformId, occurredAt: input.occurredAt, reason: input.reason.trim(), amount: paiseToDecimalString(input.amountPaise), recipientIds: [...new Set(input.recipientIds)] },
  });
  if (done.count !== 1) throw new ExpenseError("That purchase no longer exists.", "NOT_FOUND");
}

export async function deletePurchase(db: PrismaClient, userId: string, id: string): Promise<void> {
  const done = await db.shoppingPurchase.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (done.count !== 1) throw new ExpenseError("That purchase no longer exists.", "NOT_FOUND");
}

export async function setImage(db: PrismaClient, userId: string, id: string, bytes: Uint8Array<ArrayBuffer>, type: string): Promise<void> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) throw new ExpenseError("Choose an image under 3 MB.");
  if (!/^image\/(jpeg|png|webp)$/.test(type)) throw new ExpenseError("Choose a JPG, PNG or WebP image.");
  const done = await db.shoppingPurchase.updateMany({ where: { id, userId, deletedAt: null }, data: { imageData: bytes, imageType: type } });
  if (done.count !== 1) throw new ExpenseError("That purchase no longer exists.", "NOT_FOUND");
}

export async function getImage(db: PrismaClient, userId: string, id: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  const row = await db.shoppingPurchase.findFirst({ where: { id, userId, deletedAt: null }, select: { imageData: true, imageType: true } });
  if (!row?.imageData || !row.imageType) return null;
  return { bytes: row.imageData, type: row.imageType };
}

export async function getPurchase(db: PrismaClient, userId: string, id: string): Promise<PurchaseDetail | null> {
  const row = await db.shoppingPurchase.findFirst({ where: { id, userId, deletedAt: null }, select: { ...SELECT, items: { orderBy: { position: "asc" } } } });
  if (!row) return null;
  const { numbers, names } = await numbering(db, userId);
  return {
    ...toRow(row, names.get(row.platformId) ?? "", numbers.get(row.id) ?? 0),
    items: row.items.map((i) => ({ name: i.name, quantity: Number(i.quantity.toString()), ratePaise: paiseOf(i.rate), totalPaise: paiseOf(i.total), recipientIds: i.recipientIds })),
  };
}

export interface ItemInput {
  name: string;
  quantity: number;
  ratePaise: number;
  recipientIds: string[];
}

/** Replaces the item table. Blank rows are ignored; each row's total is quantity x rate. Saving it completes the details. */
export async function saveItems(db: PrismaClient, userId: string, id: string, items: readonly ItemInput[]): Promise<{ count: number; totalPaise: number }> {
  const rows = items.filter((i) => i.name.trim() || i.quantity || i.ratePaise);
  if (rows.length === 0) throw new ExpenseError("Add at least one item.");
  for (const r of rows) {
    if (!r.name.trim()) throw new ExpenseError("Every row with a quantity or rate needs an item name.");
    if (r.name.length > 200) throw new ExpenseError("Use at most 200 characters for an item.");
    if (!Number.isFinite(r.quantity) || r.quantity <= 0 || r.quantity > 999_999 || Math.round(r.quantity * 1000) / 1000 !== r.quantity) throw new ExpenseError(`Enter a quantity above zero for "${r.name}" (at most 3 decimals).`);
    if (!Number.isSafeInteger(r.ratePaise) || r.ratePaise < 0 || r.ratePaise > MAX_PAISE) throw new ExpenseError(`Enter a rate for "${r.name}" (at most 2 decimals).`);
    await checkRecipients(db, userId, r.recipientIds);
  }
  const data = rows.map((r, position) => {
    const totalPaise = Math.round(r.quantity * r.ratePaise);
    return { position, name: r.name.trim(), quantity: r.quantity.toFixed(3), rate: paiseToDecimalString(r.ratePaise), total: paiseToDecimalString(totalPaise), recipientIds: [...new Set(r.recipientIds)], totalPaise };
  });
  await db.$transaction(async (tx) => {
    const own = await tx.shoppingPurchase.findFirst({ where: { id, userId, deletedAt: null }, select: { id: true } });
    if (!own) throw new ExpenseError("That purchase no longer exists.", "NOT_FOUND");
    await tx.shoppingPurchaseItem.deleteMany({ where: { purchaseId: id } });
    await tx.shoppingPurchaseItem.createMany({ data: data.map((d) => ({ purchaseId: id, position: d.position, name: d.name, quantity: d.quantity, rate: d.rate, total: d.total, recipientIds: d.recipientIds })) });
    await tx.shoppingPurchase.update({ where: { id }, data: { detailsSaved: true } });
  });
  return { count: data.length, totalPaise: data.reduce((s, d) => s + d.totalPaise, 0) };
}

/** One person's part of a shopping purchase, with where it came from. */
export interface ShoppingShare {
  partyId: string;
  amountPaise: number;
  occurredAt: string;
  /** The item (or, for a purchase without an item table, the reason). */
  reason: string;
  platform: string;
  purchaseId: string;
}

/**
 * Each person's part of every purchase in the period, for Debt Management. An item with several recipients is split evenly
 * between them; an item without recipients falls back to the purchase's recipients; a purchase whose item table is not saved
 * is split between its own recipients.
 */
export async function shoppingShares(db: PrismaClient, userId: string, range: { from: string | null; to: string | null }): Promise<ShoppingShare[]> {
  const bounds = rangeToInstants(range.from, range.to);
  const when: Prisma.DateTimeFilter | undefined = bounds.gte || bounds.lt ? bounds : undefined;
  const purchases = await db.shoppingPurchase.findMany({
    where: { userId, deletedAt: null, platform: { deletedAt: null }, ...(when ? { occurredAt: when } : {}) },
    select: { id: true, amount: true, reason: true, occurredAt: true, recipientIds: true, detailsSaved: true, platform: { select: { name: true } }, items: { select: { name: true, total: true, recipientIds: true }, orderBy: { position: 'asc' } } },
    orderBy: { occurredAt: 'asc' },
  });
  const out: ShoppingShare[] = [];
  for (const p of purchases) {
    const base = { occurredAt: p.occurredAt.toISOString(), platform: p.platform.name, purchaseId: p.id };
    const parts = p.detailsSaved && p.items.length > 0 ? p.items.map((i) => ({ paise: paiseOf(i.total), people: i.recipientIds.length ? i.recipientIds : p.recipientIds, reason: i.name })) : [{ paise: paiseOf(p.amount), people: p.recipientIds, reason: p.reason }];
    for (const part of parts) for (const s of divideEvenly(part.paise, part.people)) out.push({ ...base, partyId: s.id, amountPaise: s.paise, reason: part.reason });
  }
  return out;
}

/** What each person owes from shopping in the period. */
export async function shoppingByRecipient(db: PrismaClient, userId: string, range: { from: string | null; to: string | null }): Promise<Map<string, number>> {
  const owed = new Map<string, number>();
  for (const s of await shoppingShares(db, userId, range)) owed.set(s.partyId, (owed.get(s.partyId) ?? 0) + s.amountPaise);
  return owed;
}

/**
 * Keeps the shopping record of a Quick Entry transaction in step with the entry. With a platform it creates the record (or
 * updates the date, reason, amount and platform of the existing one, keeping its image, recipients and items); without one it
 * removes the record the entry made. Records added by hand are never touched.
 */
export async function syncQuickEntryPurchase(
  db: PrismaClient,
  userId: string,
  transactionId: string,
  platformId: string | null,
  entry: { occurredAt: Date; reason: string; amountPaise: number },
): Promise<void> {
  const existing = await db.shoppingPurchase.findUnique({ where: { userId_transactionId: { userId, transactionId } } });
  if (!platformId) {
    if (existing && !existing.deletedAt) await db.shoppingPurchase.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    return;
  }
  const reason = entry.reason.trim() || "Shopping";
  if (!existing) {
    await createFromQuickEntry(db, userId, transactionId, { platformId, occurredAt: entry.occurredAt, reason, amountPaise: entry.amountPaise });
    return;
  }
  await requirePlatform(db, userId, platformId);
  await db.shoppingPurchase.update({
    where: { id: existing.id },
    data: { platformId, occurredAt: entry.occurredAt, reason, amount: paiseToDecimalString(entry.amountPaise), deletedAt: null },
  });
}

/** The platform a Quick Entry transaction is filed under, or null. */
export async function platformOfEntry(db: PrismaClient, userId: string, transactionId: string): Promise<string | null> {
  const row = await db.shoppingPurchase.findFirst({ where: { userId, transactionId, deletedAt: null, platform: { deletedAt: null } }, select: { platformId: true } });
  return row?.platformId ?? null;
}
