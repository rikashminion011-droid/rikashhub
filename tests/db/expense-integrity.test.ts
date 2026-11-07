/**
 * Database-level rules for the expense entry feature, run against the real SQL migrations
 * on an in-memory PostgreSQL: split totals, sub-account depth, and cross-user protection.
 */
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../prisma/migrations/", import.meta.url));

const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const GPAY = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CANARA = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const OTHER_ACCOUNT = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const MUKESH = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const BALAN = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const OTHERS_PERSON = "ffffffff-ffff-ffff-ffff-ffffffffffff";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  const folders = (await readdir(MIGRATIONS_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const folder of folders) await db.exec(await readFile(`${MIGRATIONS_DIR}${folder}/migration.sql`, "utf8"));

  await db.exec(`
    INSERT INTO users (id, email, "updatedAt") VALUES
      ('${ME}', 'me@example.com', now()), ('${OTHER}', 'other@example.com', now());
    INSERT INTO accounts (id, "userId", name, type, "updatedAt") VALUES
      ('${GPAY}', '${ME}', 'GPay', 'WALLET', now()),
      ('${OTHER_ACCOUNT}', '${OTHER}', 'Their bank', 'BANK', now());
    INSERT INTO expense_parties (id, "userId", name, "nameKey", "updatedAt") VALUES
      ('${MUKESH}', '${ME}', 'Mukesh', 'mukesh', now()),
      ('${BALAN}', '${ME}', 'Balan', 'balan', now()),
      ('${OTHERS_PERSON}', '${OTHER}', 'Someone', 'someone', now());
  `);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

let counter = 0;
const txId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

async function insertExpense(tx: PGlite | { query: PGlite["query"] }, id: string, amount: string, user = ME) {
  await tx.query(
    `INSERT INTO transactions (id, "userId", type, amount, date, "accountId", "updatedAt")
     VALUES ($1, $2, 'EXPENSE', $3, '2026-11-06', $4, now())`,
    [id, user, amount, user === ME ? GPAY : OTHER_ACCOUNT],
  );
}

async function insertSplit(tx: { query: PGlite["query"] }, txnId: string, party: string, amount: string, user = ME) {
  await tx.query(
    `INSERT INTO transaction_splits (id, "userId", "transactionId", "partyId", amount, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, now())`,
    [user, txnId, party, amount],
  );
}

describe("sub-accounts (accounts under a payment method)", () => {
  const child = (id: string, parent: string, user = ME) =>
    db.query(
      `INSERT INTO accounts (id, "userId", name, type, "parentId", "updatedAt") VALUES ($1, $2, 'Child', 'BANK', $3, now())`,
      [id, user, parent],
    );

  it("allow an account directly under a top-level method", async () => {
    await child(CANARA, GPAY);
  });

  it("refuse a third level", async () => {
    await expect(child("99999999-9999-4999-8999-999999999999", CANARA)).rejects.toThrow("one level deep");
  });

  it("refuse a parent that belongs to another user", async () => {
    await expect(child("88888888-8888-4888-8888-888888888888", OTHER_ACCOUNT)).rejects.toThrow("another user");
  });

  it("refuse a missing parent and an account that is its own parent", async () => {
    await expect(child("77777777-7777-4777-8777-777777777777", "12345678-1234-4234-8234-123456789012")).rejects.toThrow();
    await expect(db.query(`UPDATE accounts SET "parentId" = id WHERE id = $1`, [GPAY])).rejects.toThrow("accounts_parent_not_self");
  });
});

describe("expense people", () => {
  it("treat names that differ only by case as the same person", async () => {
    await expect(
      db.query(
        `INSERT INTO expense_parties (id, "userId", name, "nameKey", "updatedAt") VALUES (gen_random_uuid(), $1, 'MUKESH', 'mukesh', now())`,
        [ME],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it("let another user have the same name", async () => {
    await db.query(
      `INSERT INTO expense_parties (id, "userId", name, "nameKey", "updatedAt") VALUES (gen_random_uuid(), $1, 'Mukesh', 'mukesh', now())`,
      [OTHER],
    );
  });

  it("require nameKey to be the lower-cased trimmed name", async () => {
    await expect(
      db.query(
        `INSERT INTO expense_parties (id, "userId", name, "nameKey", "updatedAt") VALUES (gen_random_uuid(), $1, 'Raju', 'wrong', now())`,
        [ME],
      ),
    ).rejects.toThrow("expense_parties_name_valid");
  });
});

describe("split totals", () => {
  it("accept splits that add up exactly, even with odd paise", async () => {
    const id = txId();
    await db.transaction(async (tx) => {
      await insertExpense(tx, id, "100.00");
      await insertSplit(tx, id, MUKESH, "33.34");
      await insertSplit(tx, id, BALAN, "66.66");
    });
    const { rows } = await db.query<{ total: string }>(`SELECT sum(amount)::text AS total FROM transaction_splits WHERE "transactionId" = $1`, [id]);
    expect(rows[0]!.total).toBe("100.00");
  });

  it("reject splits that do not add up when the expense is saved", async () => {
    await expect(
      db.transaction(async (tx) => {
        const id = txId();
        await insertExpense(tx, id, "100.00");
        await insertSplit(tx, id, MUKESH, "60.00");
        await insertSplit(tx, id, BALAN, "39.99");
      }),
    ).rejects.toThrow("must add up");
  });

  it("reject a split that adds up to more than the expense", async () => {
    await expect(
      db.transaction(async (tx) => {
        const id = txId();
        await insertExpense(tx, id, "100.00");
        await insertSplit(tx, id, MUKESH, "100.01");
      }),
    ).rejects.toThrow("must add up");
  });

  it("reject changing the expense amount without changing the splits", async () => {
    const id = txId();
    await db.transaction(async (tx) => {
      await insertExpense(tx, id, "50.00");
      await insertSplit(tx, id, MUKESH, "50.00");
    });
    await expect(db.query(`UPDATE transactions SET amount = 75 WHERE id = $1`, [id])).rejects.toThrow("must add up");
  });

  it("allow changing the amount and the splits together", async () => {
    const id = txId();
    await db.transaction(async (tx) => {
      await insertExpense(tx, id, "50.00");
      await insertSplit(tx, id, MUKESH, "50.00");
    });
    await db.transaction(async (tx) => {
      await tx.query(`UPDATE transactions SET amount = 80 WHERE id = $1`, [id]);
      await tx.query(`UPDATE transaction_splits SET amount = 80 WHERE "transactionId" = $1`, [id]);
    });
  });

  it("reject removing one split row and leaving the rest short", async () => {
    const id = txId();
    await db.transaction(async (tx) => {
      await insertExpense(tx, id, "90.00");
      await insertSplit(tx, id, MUKESH, "45.00");
      await insertSplit(tx, id, BALAN, "45.00");
    });
    await expect(
      db.query(`DELETE FROM transaction_splits WHERE "transactionId" = $1 AND "partyId" = $2`, [id, BALAN]),
    ).rejects.toThrow("must add up");
  });

  it("accept an expense with no split rows at all", async () => {
    await insertExpense(db, txId(), "12.50");
  });

  it("delete the split rows together with the expense", async () => {
    const id = txId();
    await db.transaction(async (tx) => {
      await insertExpense(tx, id, "20.00");
      await insertSplit(tx, id, MUKESH, "20.00");
    });
    await db.query(`DELETE FROM transactions WHERE id = $1`, [id]);
    const { rows } = await db.query(`SELECT 1 FROM transaction_splits WHERE "transactionId" = $1`, [id]);
    expect(rows).toHaveLength(0);
  });

  it("reject a zero or negative split amount", async () => {
    await expect(
      db.transaction(async (tx) => {
        const id = txId();
        await insertExpense(tx, id, "10.00");
        await insertSplit(tx, id, MUKESH, "0");
      }),
    ).rejects.toThrow("transaction_splits_amount_positive");
  });

  it("reject the same person twice on one expense", async () => {
    await expect(
      db.transaction(async (tx) => {
        const id = txId();
        await insertExpense(tx, id, "10.00");
        await insertSplit(tx, id, MUKESH, "5.00");
        await insertSplit(tx, id, MUKESH, "5.00");
      }),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});

describe("user isolation on splits", () => {
  it("refuse a split that points at another user's person", async () => {
    await expect(
      db.transaction(async (tx) => {
        const id = txId();
        await insertExpense(tx, id, "10.00");
        await insertSplit(tx, id, OTHERS_PERSON, "10.00");
      }),
    ).rejects.toThrow("same user");
  });

  it("refuse a split attached to another user's expense", async () => {
    const theirs = txId();
    await db.transaction(async (tx) => {
      await insertExpense(tx, theirs, "10.00", OTHER);
    });
    await expect(
      db.transaction(async (tx) => {
        await insertSplit(tx, theirs, MUKESH, "10.00", ME);
      }),
    ).rejects.toThrow("same user");
  });
});
