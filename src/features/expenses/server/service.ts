import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { applyBalanceEffects } from "@/lib/db/ledger";
import { computeEffects, DEFAULT_EXPENSE_CATEGORIES, paiseToDecimalString, parseISODate } from "@/lib/finance";
import type { ExpenseFormData, MethodKind, MethodOption, OptionKind } from "../types";
import type { ValidExpense } from "../validation";

/** The service layer: all expense and option writes. Every query is scoped to `userId`. */

export class ExpenseError extends Error {
  constructor(
    message: string,
    readonly code: "VALIDATION" | "NOT_FOUND" | "CONFLICT" = "VALIDATION",
  ) {
    super(message);
    this.name = "ExpenseError";
  }
}

// ───────────────────────── Defaults ─────────────────────────

const DEFAULT_METHODS: { name: string; kind: MethodKind; accounts: string[] }[] = [
  { name: "GPay", kind: "WALLET", accounts: ["Canara", "IDFC", "DBS"] },
  { name: "HDFC", kind: "BANK", accounts: [] },
  { name: "Slice", kind: "CREDIT_LINE", accounts: [] },
];
const DEFAULT_PARTIES = ["Personal", "Office", "Mukesh", "Save", "Balan"];
const DEFAULT_CATEGORIES = ["Food", "Shopping"];

const nameKey = (name: string) => name.trim().toLowerCase();

/** Account type and kind to store for a method kind chosen in the form. */
function accountFieldsFor(kind: MethodKind) {
  switch (kind) {
    case "BANK":
      return { type: "BANK" as const, kind: "ASSET" as const };
    case "WALLET":
      return { type: "WALLET" as const, kind: "ASSET" as const };
    case "CASH":
      return { type: "CASH" as const, kind: "ASSET" as const };
    case "CREDIT_LINE":
      return { type: "OTHER" as const, kind: "CREDIT_LINE" as const };
    case "OTHER":
      return { type: "OTHER" as const, kind: "ASSET" as const };
  }
}

function kindOfAccount(account: { type: string; kind: string }): MethodKind {
  if (account.kind === "CREDIT_LINE" || account.type === "SLICE") return "CREDIT_LINE";
  if (account.type === "WALLET") return "WALLET";
  if (account.type === "BANK" || account.type === "DEBIT_CARD") return "BANK";
  if (account.type === "CASH") return "CASH";
  return "OTHER";
}

/**
 * Makes sure the signed-in user has a row in our own tables (the Supabase login only exists in
 * Supabase's auth schema) and, once, creates the starter payment methods, people and categories.
 * Safe to call on every request and from concurrent requests.
 */
export async function ensureUserSetup(
  db: PrismaClient,
  user: { id: string; email: string; name: string | null },
): Promise<void> {
  try {
    await db.user.upsert({ where: { id: user.id }, create: { id: user.id, email: user.email }, update: { email: user.email } });
    await db.userProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, fullName: user.name }, update: {} });
  } catch (error) {
    // Two first requests at once: the other one created the rows. Carry on.
    if (!isUniqueViolation(error)) throw error;
  }

  const profile = await db.userProfile.findUnique({ where: { userId: user.id }, select: { expenseDefaultsSeededAt: true } });
  if (!profile || profile.expenseDefaultsSeededAt) return;

  await db.$transaction(async (tx) => {
    // Whoever flips this flag first does the seeding; a concurrent request sees count 0 and skips.
    const claimed = await tx.userProfile.updateMany({
      where: { userId: user.id, expenseDefaultsSeededAt: null },
      data: { expenseDefaultsSeededAt: new Date() },
    });
    if (claimed.count === 0) return;

    // Explicit, increasing creation times keep the lists in the order written above.
    const base = Date.now();
    let tick = 0;
    const stamp = () => new Date(base + tick++);

    for (const method of DEFAULT_METHODS) {
      const parent = await tx.account.create({
        data: { userId: user.id, name: method.name, ...accountFieldsFor(method.kind), createdAt: stamp() },
      });
      for (const name of method.accounts) {
        await tx.account.create({
          data: { userId: user.id, name, ...childFieldsFor(parent), parentId: parent.id, createdAt: stamp() },
        });
      }
    }
    await tx.expenseParty.createMany({
      data: DEFAULT_PARTIES.map((name) => ({ userId: user.id, name, nameKey: nameKey(name), createdAt: stamp() })),
      skipDuplicates: true,
    });
    await tx.transactionCategory.createMany({
      data: DEFAULT_CATEGORIES.map((name) => ({
        userId: user.id,
        name,
        type: "EXPENSE" as const,
        keywords: DEFAULT_EXPENSE_CATEGORIES.find((c) => c.name.startsWith(name))?.keywords ?? [],
        createdAt: stamp(),
      })),
      skipDuplicates: true,
    });
  });
}

function childFieldsFor(parent: { kind: string }) {
  return parent.kind === "CREDIT_LINE"
    ? { type: "OTHER" as const, kind: "CREDIT_LINE" as const }
    : { type: "BANK" as const, kind: "ASSET" as const };
}

// ───────────────────────── Reading the choices ─────────────────────────

export async function getExpenseFormData(db: PrismaClient, userId: string): Promise<ExpenseFormData> {
  const [methods, parties, categories] = await Promise.all([
    db.account.findMany({
      where: { userId, deletedAt: null, parentId: null },
      include: { children: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
    db.expenseParty.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: "asc" } }),
    db.transactionCategory.findMany({ where: { userId, deletedAt: null, type: "EXPENSE" }, orderBy: { createdAt: "asc" } }),
  ]);

  return {
    methods: methods.map<MethodOption>((m) => ({
      id: m.id,
      name: m.name,
      kind: kindOfAccount(m),
      accounts: m.children.map((c) => ({ id: c.id, name: c.name })),
    })),
    parties: parties.map((p) => ({ id: p.id, name: p.name })),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
  };
}

// ───────────────────────── Adding and removing choices ─────────────────────────

function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new ExpenseError("Enter a name.");
  if (name.length > 60) throw new ExpenseError("Use at most 60 characters.");
  return name;
}

export async function addPaymentMethod(
  db: PrismaClient,
  userId: string,
  input: { name: string; kind: MethodKind },
): Promise<string> {
  const name = cleanName(input.name);
  const existing = await db.account.findFirst({
    where: { userId, parentId: null, name: { equals: name, mode: "insensitive" } },
  });
  if (existing && !existing.deletedAt) throw new ExpenseError(`"${existing.name}" already exists.`, "CONFLICT");
  if (existing) {
    // Previously removed: bring it back instead of creating a duplicate.
    await db.account.update({ where: { id: existing.id }, data: { deletedAt: null, createdAt: new Date() } });
    return existing.id;
  }
  const created = await db.account.create({ data: { userId, name, ...accountFieldsFor(input.kind) } });
  return created.id;
}

export async function addAccount(
  db: PrismaClient,
  userId: string,
  input: { methodId: string; name: string },
): Promise<string> {
  const name = cleanName(input.name);
  const method = await db.account.findFirst({ where: { id: input.methodId, userId, parentId: null, deletedAt: null } });
  if (!method) throw new ExpenseError("That payment method no longer exists.", "NOT_FOUND");

  const existing = await db.account.findFirst({
    where: { userId, parentId: method.id, name: { equals: name, mode: "insensitive" } },
  });
  if (existing && !existing.deletedAt) throw new ExpenseError(`"${existing.name}" already exists under ${method.name}.`, "CONFLICT");
  if (existing) {
    await db.account.update({ where: { id: existing.id }, data: { deletedAt: null, createdAt: new Date() } });
    return existing.id;
  }
  const created = await db.account.create({ data: { userId, name, parentId: method.id, ...childFieldsFor(method) } });
  return created.id;
}

export async function addParty(db: PrismaClient, userId: string, input: { name: string }): Promise<string> {
  const name = cleanName(input.name);
  const key = nameKey(name);
  const existing = await db.expenseParty.findUnique({ where: { userId_nameKey: { userId, nameKey: key } } });
  if (existing && !existing.deletedAt) throw new ExpenseError(`"${existing.name}" already exists.`, "CONFLICT");
  if (existing) {
    await db.expenseParty.update({ where: { id: existing.id }, data: { deletedAt: null, name, createdAt: new Date() } });
    return existing.id;
  }
  return (await db.expenseParty.create({ data: { userId, name, nameKey: key } })).id;
}

export async function addCategory(db: PrismaClient, userId: string, input: { name: string }): Promise<string> {
  const name = cleanName(input.name);
  const existing = await db.transactionCategory.findFirst({
    where: { userId, type: "EXPENSE", name: { equals: name, mode: "insensitive" } },
  });
  if (existing && !existing.deletedAt) throw new ExpenseError(`"${existing.name}" already exists.`, "CONFLICT");
  if (existing) {
    await db.transactionCategory.update({ where: { id: existing.id }, data: { deletedAt: null, createdAt: new Date() } });
    return existing.id;
  }
  return (await db.transactionCategory.create({ data: { userId, name, type: "EXPENSE", keywords: [] } })).id;
}

/** Removes an option from the lists. Past expenses keep pointing at it, so history is untouched. */
export async function archiveOption(db: PrismaClient, userId: string, input: { kind: OptionKind; id: string }): Promise<void> {
  const now = new Date();
  let count: number;

  switch (input.kind) {
    case "method":
      count = await db.$transaction(async (tx) => {
        const result = await tx.account.updateMany({ where: { id: input.id, userId, parentId: null, deletedAt: null }, data: { deletedAt: now } });
        if (result.count === 1) {
          await tx.account.updateMany({ where: { parentId: input.id, userId, deletedAt: null }, data: { deletedAt: now } });
        }
        return result.count;
      });
      break;
    case "account":
      count = (await db.account.updateMany({ where: { id: input.id, userId, parentId: { not: null }, deletedAt: null }, data: { deletedAt: now } })).count;
      break;
    case "party":
      count = (await db.expenseParty.updateMany({ where: { id: input.id, userId, deletedAt: null }, data: { deletedAt: now } })).count;
      break;
    case "category":
      count = (await db.transactionCategory.updateMany({ where: { id: input.id, userId, type: "EXPENSE", deletedAt: null }, data: { deletedAt: now } })).count;
      break;
  }
  if (count !== 1) throw new ExpenseError("That option no longer exists.", "NOT_FOUND");
}

// ───────────────────────── Saving an expense ─────────────────────────

/**
 * Saves one expense: the transaction, who it is for (one row, or one per person in a split), and
 * the balance change on the account it was paid from, all in a single database transaction.
 *
 * `requestId` makes saving idempotent: sending the same form twice (double click, retry after a
 * dropped connection) returns the first expense instead of creating another one.
 */
export async function createExpense(
  db: PrismaClient,
  userId: string,
  requestId: string,
  expense: ValidExpense,
): Promise<{ id: string; duplicate: boolean }> {
  const dedupeKey = `expense-entry:${requestId}`;
  try {
    return await db.$transaction(async (tx) => {
      const already = await tx.transaction.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey } }, select: { id: true } });
      if (already) return { id: already.id, duplicate: true };

      // The payment method, and the account under it when it has any.
      const method = await tx.account.findFirst({
        where: { id: expense.methodId, userId, parentId: null, deletedAt: null },
        include: { children: { where: { deletedAt: null } } },
      });
      if (!method) throw new ExpenseError("That payment method no longer exists. Pick another.", "NOT_FOUND");

      let source = method;
      if (method.children.length > 0) {
        if (!expense.accountId) throw new ExpenseError(`Choose the account under ${method.name}.`);
        const account = method.children.find((c) => c.id === expense.accountId);
        if (!account) throw new ExpenseError(`That account is not under ${method.name}.`, "NOT_FOUND");
        source = { ...account, children: [] };
      } else if (expense.accountId) {
        throw new ExpenseError(`That account is not under ${method.name}.`, "NOT_FOUND");
      }

      const category = await tx.transactionCategory.findFirst({
        where: { id: expense.categoryId, userId, type: "EXPENSE", deletedAt: null },
      });
      if (!category) throw new ExpenseError("That category no longer exists. Pick another.", "NOT_FOUND");

      const partyIds = [...new Set(expense.allocations.map((a) => a.partyId))];
      const parties = await tx.expenseParty.findMany({ where: { id: { in: partyIds }, userId, deletedAt: null }, select: { id: true } });
      if (parties.length !== partyIds.length) throw new ExpenseError("One of the selected people no longer exists. Pick again.", "NOT_FOUND");

      const allocated = expense.allocations.reduce((sum, a) => sum + a.amountPaise, 0);
      if (allocated !== expense.amountPaise) throw new ExpenseError("The split does not add up to the expense amount.");

      // What this does to balances is decided by the shared ledger rules: spending from an account
      // lowers it, spending on a credit line (Slice) raises what is owed.
      const { effects } = computeEffects({
        type: "EXPENSE",
        amountPaise: expense.amountPaise,
        source: { kind: source.kind === "CREDIT_LINE" ? "CREDIT_LINE" : "ACCOUNT", id: source.id },
      });

      const created = await tx.transaction.create({
        data: {
          userId,
          type: "EXPENSE",
          amount: paiseToDecimalString(expense.amountPaise),
          date: parseISODate(expense.date),
          accountId: source.id,
          categoryId: category.id,
          description: expense.notes || null,
          isSplit: expense.isSplit,
          dedupeKey,
        },
        select: { id: true },
      });
      await tx.transactionSplit.createMany({
        data: expense.allocations.map((a) => ({
          userId,
          transactionId: created.id,
          partyId: a.partyId,
          amount: paiseToDecimalString(a.amountPaise),
        })),
      });
      await applyBalanceEffects(tx, userId, effects);
      await tx.auditLog.create({
        data: {
          userId,
          action: "expense.create",
          entity: "transaction",
          entityId: created.id,
          after: {
            amountPaise: expense.amountPaise,
            accountId: source.id,
            categoryId: category.id,
            isSplit: expense.isSplit,
            people: expense.allocations.length,
          },
        },
      });
      return { id: created.id, duplicate: false };
    });
  } catch (error) {
    // Two identical requests at the same instant: the loser hits the unique key. Return the winner.
    if (isUniqueViolation(error)) {
      const winner = await db.transaction.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey } }, select: { id: true } });
      if (winner) return { id: winner.id, duplicate: true };
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
