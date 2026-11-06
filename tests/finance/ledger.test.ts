import { describe, expect, it } from "vitest";
import {
  LedgerError,
  computeEffects,
  mergeEffects,
  netEffects,
  reconcileBalances,
  summarizeReporting,
  type InstrumentRef,
  type LedgerTransaction,
} from "@/lib/finance";

const bank: InstrumentRef = { kind: "ACCOUNT", id: "bank" };
const bank2: InstrumentRef = { kind: "ACCOUNT", id: "bank2" };
const slice: InstrumentRef = { kind: "CREDIT_LINE", id: "slice" };
const card: InstrumentRef = { kind: "CREDIT_CARD", id: "card" };
const savings: InstrumentRef = { kind: "SAVINGS", id: "sav" };
const debt: InstrumentRef = { kind: "DEBT", id: "debt" };

const deltas = (tx: LedgerTransaction) =>
  Object.fromEntries(
    computeEffects(tx).effects.map((e) => [`${e.instrument.kind}:${e.instrument.id}`, e.delta]),
  );

describe("computeEffects", () => {
  it("INCOME credits the account and counts as income", () => {
    const result = computeEffects({ type: "INCOME", amountPaise: 5000000, target: bank });
    expect(deltas({ type: "INCOME", amountPaise: 5000000, target: bank })).toEqual({ "ACCOUNT:bank": 5000000 });
    expect(result.reporting).toBe("INCOME");
  });

  it("EXPENSE from an account reduces its balance", () => {
    const tx: LedgerTransaction = { type: "EXPENSE", amountPaise: 25000, source: bank };
    expect(deltas(tx)).toEqual({ "ACCOUNT:bank": -25000 });
    expect(computeEffects(tx).reporting).toBe("EXPENSE");
  });

  it("EXPENSE on a credit card raises what is owed and is still an expense", () => {
    const tx: LedgerTransaction = { type: "EXPENSE", amountPaise: 25000, source: card };
    expect(deltas(tx)).toEqual({ "CREDIT_CARD:card": 25000 });
    expect(computeEffects(tx).reporting).toBe("EXPENSE");
  });

  it("EXPENSE on a Slice credit line raises the amount owed", () => {
    expect(deltas({ type: "EXPENSE", amountPaise: 10000, source: slice })).toEqual({
      "CREDIT_LINE:slice": 10000,
    });
  });

  it("SUBSCRIPTION_PAYMENT behaves like an expense", () => {
    const tx: LedgerTransaction = { type: "SUBSCRIPTION_PAYMENT", amountPaise: 649, source: card };
    expect(deltas(tx)).toEqual({ "CREDIT_CARD:card": 649 });
    expect(computeEffects(tx).reporting).toBe("EXPENSE");
  });

  it("CREDIT_CARD_PAYMENT lowers the card balance and the bank, and is NOT an expense", () => {
    const tx: LedgerTransaction = { type: "CREDIT_CARD_PAYMENT", amountPaise: 40000, source: bank, target: card };
    expect(deltas(tx)).toEqual({ "ACCOUNT:bank": -40000, "CREDIT_CARD:card": -40000 });
    expect(computeEffects(tx).reporting).toBe("NEUTRAL");
  });

  it("CREDIT_CARD_PAYMENT can repay a Slice credit line", () => {
    const tx: LedgerTransaction = { type: "CREDIT_CARD_PAYMENT", amountPaise: 3000, source: bank, target: slice };
    expect(deltas(tx)).toEqual({ "ACCOUNT:bank": -3000, "CREDIT_LINE:slice": -3000 });
  });

  it("TRANSFER moves money without touching income or expense", () => {
    const tx: LedgerTransaction = { type: "TRANSFER", amountPaise: 100000, source: bank, target: bank2 };
    expect(deltas(tx)).toEqual({ "ACCOUNT:bank": -100000, "ACCOUNT:bank2": 100000 });
    expect(computeEffects(tx).reporting).toBe("NEUTRAL");
  });

  it("SAVINGS_DEPOSIT and SAVINGS_WITHDRAWAL are mirror images and neutral", () => {
    const deposit: LedgerTransaction = { type: "SAVINGS_DEPOSIT", amountPaise: 20000, source: bank, target: savings };
    const withdrawal: LedgerTransaction = { type: "SAVINGS_WITHDRAWAL", amountPaise: 5000, source: savings, target: bank };
    expect(deltas(deposit)).toEqual({ "ACCOUNT:bank": -20000, "SAVINGS:sav": 20000 });
    expect(deltas(withdrawal)).toEqual({ "SAVINGS:sav": -5000, "ACCOUNT:bank": 5000 });
    expect(computeEffects(deposit).reporting).toBe("NEUTRAL");
    expect(computeEffects(withdrawal).reporting).toBe("NEUTRAL");
  });

  it("DEBT_PAYMENT / EMI_PAYMENT you owe: bank down, debt down, neutral", () => {
    for (const type of ["DEBT_PAYMENT", "EMI_PAYMENT"] as const) {
      const tx: LedgerTransaction = { type, amountPaise: 150000, source: bank, target: debt };
      expect(deltas(tx)).toEqual({ "ACCOUNT:bank": -150000, "DEBT:debt": -150000 });
      expect(computeEffects(tx).reporting).toBe("NEUTRAL");
    }
  });

  it("DEBT_PAYMENT owed to you: cash arrives and the receivable shrinks", () => {
    const tx: LedgerTransaction = {
      type: "DEBT_PAYMENT",
      amountPaise: 70000,
      source: debt,
      target: bank,
      debtDirection: "OWED_TO_ME",
    };
    expect(deltas(tx)).toEqual({ "DEBT:debt": -70000, "ACCOUNT:bank": 70000 });
    expect(computeEffects(tx).reporting).toBe("NEUTRAL");
  });

  it("an EMI payment can never be money owed to you", () => {
    expect(() =>
      computeEffects({
        type: "EMI_PAYMENT",
        amountPaise: 100,
        source: debt,
        target: bank,
        debtDirection: "OWED_TO_ME",
      }),
    ).toThrow(LedgerError);
  });
});

describe("validation", () => {
  it("rejects zero, negative and fractional amounts", () => {
    expect(() => computeEffects({ type: "INCOME", amountPaise: 0, target: bank })).toThrow(LedgerError);
    expect(() => computeEffects({ type: "INCOME", amountPaise: -5, target: bank })).toThrow(LedgerError);
    expect(() => computeEffects({ type: "INCOME", amountPaise: 10.5, target: bank })).toThrow(RangeError);
  });

  it("rejects a transfer to the same account", () => {
    expect(() =>
      computeEffects({ type: "TRANSFER", amountPaise: 100, source: bank, target: bank }),
    ).toThrow("same account");
  });

  it("rejects missing or wrong instruments", () => {
    expect(() => computeEffects({ type: "EXPENSE", amountPaise: 100 })).toThrow(LedgerError);
    expect(() => computeEffects({ type: "INCOME", amountPaise: 100, target: card })).toThrow(LedgerError);
    expect(() => computeEffects({ type: "EXPENSE", amountPaise: 100, source: savings })).toThrow(LedgerError);
    expect(() =>
      computeEffects({ type: "CREDIT_CARD_PAYMENT", amountPaise: 100, source: card, target: card }),
    ).toThrow(LedgerError);
  });

  it("rejects instruments a type must not have", () => {
    expect(() =>
      computeEffects({ type: "INCOME", amountPaise: 100, source: bank, target: bank2 }),
    ).toThrow(LedgerError);
    expect(() =>
      computeEffects({ type: "EXPENSE", amountPaise: 100, source: bank, target: bank2 }),
    ).toThrow(LedgerError);
  });
});

describe("no double counting", () => {
  it("card purchase then card payment counts the spend exactly once", () => {
    const totals = summarizeReporting([
      { type: "EXPENSE", amountPaise: 500000, source: card },
      { type: "CREDIT_CARD_PAYMENT", amountPaise: 500000, source: bank, target: card },
    ]);
    expect(totals).toEqual({ incomePaise: 0, expensePaise: 500000 });
  });

  it("transfers, savings and debt settlements never move income or expense", () => {
    const totals = summarizeReporting([
      { type: "INCOME", amountPaise: 9000000, target: bank },
      { type: "TRANSFER", amountPaise: 1000000, source: bank, target: bank2 },
      { type: "SAVINGS_DEPOSIT", amountPaise: 2000000, source: bank, target: savings },
      { type: "SAVINGS_WITHDRAWAL", amountPaise: 500000, source: savings, target: bank },
      { type: "EMI_PAYMENT", amountPaise: 300000, source: bank, target: debt },
      { type: "EXPENSE", amountPaise: 150000, source: bank },
    ]);
    expect(totals).toEqual({ incomePaise: 9000000, expensePaise: 150000 });
  });
});

describe("mergeEffects", () => {
  it("sums per instrument and drops zero net changes", () => {
    const merged = mergeEffects([
      { instrument: bank, delta: -100 },
      { instrument: bank, delta: 100 },
      { instrument: bank2, delta: 50 },
      { instrument: bank2, delta: 25 },
    ]);
    expect(merged).toEqual([{ instrument: bank2, delta: 75 }]);
  });
});

describe("netEffects (create / edit / delete)", () => {
  const spend = (amountPaise: number, source: InstrumentRef): LedgerTransaction => ({
    type: "EXPENSE",
    amountPaise,
    source,
  });
  const net = (prev: LedgerTransaction | null, next: LedgerTransaction | null) =>
    Object.fromEntries(
      netEffects(prev, next).map((e) => [`${e.instrument.kind}:${e.instrument.id}`, e.delta]),
    );

  it("create applies the effects", () => {
    expect(net(null, spend(500, bank))).toEqual({ "ACCOUNT:bank": -500 });
  });

  it("delete reverses the effects", () => {
    expect(net(spend(500, bank), null)).toEqual({ "ACCOUNT:bank": 500 });
  });

  it("editing the amount applies only the difference", () => {
    expect(net(spend(500, bank), spend(800, bank))).toEqual({ "ACCOUNT:bank": -300 });
  });

  it("editing to a different account moves the charge", () => {
    expect(net(spend(500, bank), spend(800, bank2))).toEqual({ "ACCOUNT:bank": 500, "ACCOUNT:bank2": -800 });
  });

  it("an unchanged edit changes nothing", () => {
    expect(netEffects(spend(500, bank), spend(500, bank))).toEqual([]);
  });

  it("switching an expense from bank to credit card moves both balances", () => {
    expect(net(spend(500, bank), spend(500, card))).toEqual({ "ACCOUNT:bank": 500, "CREDIT_CARD:card": 500 });
  });
});

describe("reconcileBalances", () => {
  it("recomputes balances from opening balances and the ledger", () => {
    const balances = reconcileBalances(
      { "ACCOUNT:bank": 10_000_000, "CREDIT_CARD:card": 0 },
      [
        { type: "EXPENSE", amountPaise: 2_000_000, source: card },
        { type: "CREDIT_CARD_PAYMENT", amountPaise: 2_000_000, source: bank, target: card },
        { type: "INCOME", amountPaise: 5_000_000, target: bank },
      ],
    );
    expect(balances["ACCOUNT:bank"]).toBe(13_000_000);
    expect(balances["CREDIT_CARD:card"]).toBe(0);
  });

  it("matches applying each transaction's net effects one by one", () => {
    const txs: LedgerTransaction[] = [
      { type: "INCOME", amountPaise: 8_000_000, target: bank },
      { type: "SAVINGS_DEPOSIT", amountPaise: 1_500_000, source: bank, target: savings },
      { type: "TRANSFER", amountPaise: 700_000, source: bank, target: bank2 },
      { type: "EXPENSE", amountPaise: 123_456, source: bank2 },
    ];
    const incremental: Record<string, number> = {};
    for (const tx of txs) {
      for (const e of netEffects(null, tx)) {
        const key = `${e.instrument.kind}:${e.instrument.id}`;
        incremental[key] = (incremental[key] ?? 0) + e.delta;
      }
    }
    expect(reconcileBalances({}, txs)).toEqual(incremental);
  });
});
