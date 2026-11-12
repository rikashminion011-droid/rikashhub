/**
 * Applies the real SQL migrations to an in-memory PostgreSQL (PGlite) and checks that the
 * database itself enforces the integrity rules: no network or external database needed.
 */
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../prisma/migrations/", import.meta.url));

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER_USER = "22222222-2222-2222-2222-222222222222";
const ACCOUNT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ACCOUNT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CARD = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const DEBT = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const RECURRING = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

let db: PGlite;

async function applyMigrations(target: PGlite) {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  for (const folder of folders) {
    await target.exec(await readFile(`${MIGRATIONS_DIR}${folder}/migration.sql`, "utf8"));
  }
}

/** Expect a statement to be rejected by the named constraint. */
async function rejectedBy(constraint: string, sql: string) {
  await expect(db.exec(sql)).rejects.toThrow(constraint);
}

const tx = (cols: string, vals: string) =>
  `INSERT INTO transactions (id, "userId", type, amount, date, "updatedAt", ${cols})
   VALUES (gen_random_uuid(), '${USER}', ${vals.replace("__", "")})`;

beforeAll(async () => {
  db = new PGlite();
  await applyMigrations(db);
  await db.exec(`
    INSERT INTO users (id, email, "updatedAt") VALUES
      ('${USER}', 'me@example.com', now()), ('${OTHER_USER}', 'other@example.com', now());
    INSERT INTO accounts (id, "userId", name, type, "updatedAt") VALUES
      ('${ACCOUNT_A}', '${USER}', 'Bank A', 'BANK', now()),
      ('${ACCOUNT_B}', '${USER}', 'Bank B', 'BANK', now());
    INSERT INTO credit_cards (id, "userId", "bankName", "cardName", "cardLast4", "creditLimit", "billingDay", "statementDay", "dueDay", "updatedAt")
      VALUES ('${CARD}', '${USER}', 'HDFC', 'Regalia', '1234', 100000, 1, 2, 20, now());
    INSERT INTO debts (id, "userId", direction, type, counterparty, principal, "startDate", "outstandingPrincipal", "updatedAt")
      VALUES ('${DEBT}', '${USER}', 'OWE', 'PERSONAL_LOAN', 'Friend', 50000, '2026-01-01', 50000, now());
    INSERT INTO recurring_payments (id, "userId", name, category, amount, recurrence, "startDate", "updatedAt")
      VALUES ('${RECURRING}', '${USER}', 'Rent', 'RENT', 20000, 'MONTHLY', '2026-01-05', now());
  `);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("migrations", () => {
  it("create all 25 tables", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      "accounts", "attachments", "audit_logs", "credit_card_statements", "credit_cards",
      "debt_payments", "debts", "expense_parties", "food_entries", "food_items", "food_meal_prices",
      "milestone_contributions", "milestones",
      "monthly_dues", "monthly_summaries", "payment_records", "recurring_payments", "reminders",
      "savings_accounts", "savings_transactions", "transaction_categories", "transaction_splits",
      "transactions", "user_profiles", "users",
    ]);
  });

  it("enable Row Level Security on every table", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    );
    expect(rows).toHaveLength(25);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it("define no RLS policies, so the public API roles can reach nothing", async () => {
    const { rows } = await db.query(`SELECT 1 FROM pg_policies WHERE schemaname = 'public'`);
    expect(rows).toHaveLength(0);
  });
});

describe("transactions", () => {
  it("accept a valid expense", async () => {
    await db.exec(tx(`"accountId"`, `'EXPENSE', 250.50, '2026-11-06', now(), '${ACCOUNT_A}'`));
  });

  it("reject a zero or negative amount", async () => {
    await rejectedBy("transactions_amount_positive", tx(`"accountId"`, `'EXPENSE', 0, '2026-11-06', now(), '${ACCOUNT_A}'`));
    await rejectedBy("transactions_amount_positive", tx(`"accountId"`, `'INCOME', -5, '2026-11-06', now(), '${ACCOUNT_A}'`));
  });

  it("reject more than one source instrument", async () => {
    await rejectedBy(
      "transactions_single_source",
      tx(`"accountId", "creditCardId"`, `'EXPENSE', 10, '2026-11-06', now(), '${ACCOUNT_A}', '${CARD}'`),
    );
  });

  it("reject a transfer to the same account or without a destination", async () => {
    await rejectedBy(
      "transactions_transfer_distinct",
      tx(`"accountId", "toAccountId"`, `'TRANSFER', 10, '2026-11-06', now(), '${ACCOUNT_A}', '${ACCOUNT_A}'`),
    );
    await rejectedBy(
      "transactions_transfer_distinct",
      tx(`"accountId"`, `'TRANSFER', 10, '2026-11-06', now(), '${ACCOUNT_A}'`),
    );
  });

  it("accept a transfer between two accounts", async () => {
    await db.exec(
      tx(`"accountId", "toAccountId"`, `'TRANSFER', 10, '2026-11-06', now(), '${ACCOUNT_A}', '${ACCOUNT_B}'`),
    );
  });

  it("store money exactly, with no float error", async () => {
    await db.exec(tx(`"accountId"`, `'EXPENSE', 0.10, '2026-11-07', now(), '${ACCOUNT_B}'`));
    await db.exec(tx(`"accountId"`, `'EXPENSE', 0.20, '2026-11-07', now(), '${ACCOUNT_B}'`));
    const { rows } = await db.query<{ total: string }>(
      `SELECT sum(amount)::text AS total FROM transactions WHERE date = '2026-11-07' AND "accountId" = '${ACCOUNT_B}'`,
    );
    expect(rows[0]!.total).toBe("0.30");
  });

  it("make a repeated automated entry impossible via the per-user dedupe key", async () => {
    const insert = `INSERT INTO transactions (id, "userId", type, amount, date, "dedupeKey", "updatedAt")
      VALUES (gen_random_uuid(), '${USER}', 'EXPENSE', 99, '2026-11-01', 'rent:2026-11', now())
      ON CONFLICT ("userId", "dedupeKey") DO NOTHING`;
    await db.exec(insert);
    await db.exec(insert);
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM transactions WHERE "dedupeKey" = 'rent:2026-11'`,
    );
    expect(rows[0]!.n).toBe(1);
  });

  it("allow the same dedupe key for a different user", async () => {
    await db.exec(`INSERT INTO transactions (id, "userId", type, amount, date, "dedupeKey", "updatedAt")
      VALUES (gen_random_uuid(), '${OTHER_USER}', 'EXPENSE', 99, '2026-11-01', 'rent:2026-11', now())`);
  });
});

describe("credit cards", () => {
  const card = (cols: string, vals: string) =>
    `INSERT INTO credit_cards (id, "userId", "bankName", "cardName", "cardLast4", "creditLimit", "billingDay", "statementDay", "dueDay", "updatedAt")
     VALUES (gen_random_uuid(), '${USER}', 'SBI', 'Card', ${cols}, ${vals}, now())`;

  it("accept only a four-digit last4", async () => {
    // A full card number cannot even fit in the column...
    await rejectedBy("value too long", card(`'1234567812345678'`, `5000, 1, 2, 3`));
    // ...and four non-digits are refused by the check constraint.
    await rejectedBy("credit_cards_last4", card(`'12ab'`, `5000, 1, 2, 3`));
  });

  it("reject a negative limit and impossible billing days", async () => {
    await rejectedBy("credit_cards_limit_nonneg", card(`'1111'`, `-1, 1, 2, 3`));
    await rejectedBy("credit_cards_days_valid", card(`'1111'`, `5000, 0, 2, 3`));
    await rejectedBy("credit_cards_days_valid", card(`'1111'`, `5000, 1, 2, 32`));
  });
});

describe("monthly dues", () => {
  const due = (date: string) => `INSERT INTO monthly_dues (id, "userId", "recurringPaymentId", name, category, amount, "dueDate", "updatedAt")
    VALUES (gen_random_uuid(), '${USER}', '${RECURRING}', 'Rent', 'RENT', 20000, '${date}', now())`;

  it("generate a recurring due only once per date (idempotent generation)", async () => {
    await db.exec(`${due("2026-11-05")} ON CONFLICT ("recurringPaymentId", "dueDate") DO NOTHING`);
    await db.exec(`${due("2026-11-05")} ON CONFLICT ("recurringPaymentId", "dueDate") DO NOTHING`);
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM monthly_dues WHERE "recurringPaymentId" = '${RECURRING}' AND "dueDate" = '2026-11-05'`,
    );
    expect(rows[0]!.n).toBe(1);
  });

  it("reject a plain duplicate insert", async () => {
    await expect(db.exec(due("2026-11-05"))).rejects.toThrow(/duplicate key|unique/i);
  });

  it("reject a non-positive amount", async () => {
    await rejectedBy(
      "dues_amount_positive",
      `INSERT INTO monthly_dues (id, "userId", name, category, amount, "dueDate", "updatedAt")
       VALUES (gen_random_uuid(), '${USER}', 'Bad', 'OTHER', 0, '2026-11-05', now())`,
    );
  });
});

describe("debts", () => {
  const payment = (amount: number, principal: number, interest: number) =>
    `INSERT INTO debt_payments (id, "userId", "debtId", amount, "principalPart", "interestPart", "paidOn", "updatedAt")
     VALUES (gen_random_uuid(), '${USER}', '${DEBT}', ${amount}, ${principal}, ${interest}, '2026-11-06', now())`;

  it("require a payment to equal principal part plus interest part", async () => {
    await db.exec(payment(1000, 900, 100));
    await rejectedBy("debt_payments_parts_add_up", payment(1000, 900, 50));
  });

  it("reject a negative outstanding balance and an out-of-range rate", async () => {
    await rejectedBy("debts_outstanding_nonneg", `UPDATE debts SET "outstandingPrincipal" = -1 WHERE id = '${DEBT}'`);
    await rejectedBy("debts_rate_valid", `UPDATE debts SET "interestRate" = 150 WHERE id = '${DEBT}'`);
  });
});

describe("savings, milestones and attachments", () => {
  it("never let a savings balance go negative", async () => {
    await db.exec(`INSERT INTO savings_accounts (id, "userId", name, balance, "updatedAt")
      VALUES (gen_random_uuid(), '${USER}', 'Emergency', 1000, now())`);
    await rejectedBy(
      "savings_balance_nonneg",
      `UPDATE savings_accounts SET balance = balance - 5000 WHERE "userId" = '${USER}'`,
    );
  });

  it("require a milestone to have a positive target and a sensible date range", async () => {
    const milestone = (target: number, start: string, end: string) =>
      `INSERT INTO milestones (id, "userId", name, "targetAmount", "startDate", "targetDate", "updatedAt")
       VALUES (gen_random_uuid(), '${USER}', 'Car', ${target}, '${start}', '${end}', now())`;
    await db.exec(milestone(500000, "2026-01-01", "2027-01-01"));
    await rejectedBy("milestones_target_positive", milestone(0, "2026-01-01", "2027-01-01"));
    await rejectedBy("milestones_dates_valid", milestone(500000, "2027-01-01", "2026-01-01"));
  });

  it("cap attachment size at 5 MB", async () => {
    const attachment = (size: number) => `INSERT INTO attachments (id, "userId", "fileName", "mimeType", "sizeBytes", "storagePath", "updatedAt")
      VALUES (gen_random_uuid(), '${USER}', 'r.pdf', 'application/pdf', ${size}, 'u/r.pdf', now())`;
    await db.exec(attachment(1024));
    await rejectedBy("attachments_size_valid", attachment(6_000_000));
  });

  it("allow one reminder per user, kind, record and day", async () => {
    const reminder = `INSERT INTO reminders (id, "userId", kind, "refType", "refId", title, "remindOn", "updatedAt")
      VALUES (gen_random_uuid(), '${USER}', 'DUE_UPCOMING', 'monthly_due', '${RECURRING}', 'Rent due', '2026-11-02', now())
      ON CONFLICT ("userId", kind, "refType", "refId", "remindOn") DO NOTHING`;
    await db.exec(reminder);
    await db.exec(reminder);
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM reminders WHERE "refId" = '${RECURRING}'`);
    expect(rows[0]!.n).toBe(1);
  });
});
