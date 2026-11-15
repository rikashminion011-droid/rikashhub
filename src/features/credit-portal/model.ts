import { istDateOf, istInstant, istTimeOf } from "@/features/quick-pay/datetime";

/**
 * Credit Portal rules that need no database: reading an HDFC credit card statement, matching statement lines to unbilled
 * transactions, the utilization bar and how recipients are shown. All money is in integer paise.
 */

export interface StatementLine {
  /** The moment of the transaction (India time, as printed on the statement). */
  occurredAt: Date;
  /** What the statement says (merchant and city, or the charge). */
  details: string;
  debitPaise: number;
  creditPaise: number;
  /** Stops the same line being imported twice (the same line twice in one file is told apart by its position). */
  key: string;
}

export interface StatementSummary {
  totalCreditPaise: number | null;
  availableCreditPaise: number | null;
  totalDuePaise: number | null;
  statementDate: string | null;
  period: { from: string; to: string } | null;
}

const MONTHS: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

/** "2,363.00" gives 236300. */
export function paiseOfText(text: string): number | null {
  const m = /^(\d{1,3}(?:,\d{2,3})*|\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const rupees = Number(m[1]!.replace(/,/g, ""));
  const paise = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  const total = rupees * 100 + paise;
  return Number.isSafeInteger(total) ? total : null;
}

// A transaction line: "17/09/2026| 20:18 AVENUE SUPERMARTS LIMITCHENNAI C 2,363.00 l". The rupee sign prints as "C"; a "+" in front
// of it is how the statement marks a credit (shown in green), everything else is a debit (black).
const LINE = /^(\d{2})\/(\d{2})\/(\d{4})\s*\|\s*(\d{2}):(\d{2})\s+(.+?)\s+(\+\s*)?C\s*([\d,]+(?:\.\d{1,2})?)\s*l?\s*$/;

const normal = (text: string) => text.replace(/\s+/g, " ").trim();

/** Reads the transactions and the summary of an HDFC Bank credit card statement, from the text of each page. */
export function parseHdfcStatement(pages: readonly string[]): { lines: StatementLine[]; summary: StatementSummary; skipped: string[] } {
  const lines: StatementLine[] = [];
  const skipped: string[] = [];
  const seen = new Map<string, number>();

  for (const page of pages) {
    for (const raw of page.split(/\r?\n/)) {
      const text = normal(raw);
      if (!/^\d{2}\/\d{2}\/\d{4}/.test(text)) continue;
      const m = LINE.exec(text);
      if (!m) {
        skipped.push(text);
        continue;
      }
      const [, dd, mm, yyyy, hh, min, details, plus, amount] = m;
      const paise = paiseOfText(amount!);
      if (paise === null || paise <= 0) {
        skipped.push(text);
        continue;
      }
      let occurredAt: Date;
      try {
        occurredAt = istInstant(`${yyyy}-${mm}-${dd}`, `${hh}:${min}`);
      } catch {
        skipped.push(text);
        continue;
      }
      const credit = Boolean(plus);
      const base = `${yyyy}${mm}${dd}${hh}${min}|${credit ? "C" : "D"}|${paise}|${normal(details!).toLowerCase()}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      lines.push({ occurredAt, details: normal(details!), debitPaise: credit ? 0 : paise, creditPaise: credit ? paise : 0, key: `${base}|${n}` });
    }
  }

  const whole = pages.join("\n");
  const money = (re: RegExp) => {
    const m = re.exec(whole);
    return m ? paiseOfText(m[1]!) : null;
  };
  const limit = /TOTAL CREDIT LIMIT[\s\S]{0,80}?AVAILABLE CASH LIMIT\s*C\s*([\d,]+)\s*C\s*([\d,]+)\s*C\s*([\d,]+)/.exec(whole);
  const dateOf = (text: string | undefined) => {
    const m = /^(\d{1,2}) ([A-Za-z]{3}),? (\d{4})$/.exec((text ?? "").trim());
    return m && MONTHS[m[2]!] ? `${m[3]}-${MONTHS[m[2]!]}-${m[1]!.padStart(2, "0")}` : null;
  };
  const period = /Billing Period[\s\S]{0,200}?(\d{1,2} [A-Za-z]{3},? \d{4}) - (\d{1,2} [A-Za-z]{3},? \d{4})/.exec(whole);
  const statement = /Statement Date[\s\S]{0,200}?(\d{1,2} [A-Za-z]{3},? \d{4})/.exec(whole);
  const from = dateOf(period?.[1]);
  const to = dateOf(period?.[2]);

  return {
    lines,
    skipped,
    summary: {
      totalCreditPaise: limit ? paiseOfText(limit[1]!) : null,
      availableCreditPaise: limit ? paiseOfText(limit[2]!) : null,
      totalDuePaise: money(/TOTAL AMOUNT DUE\s*C\s*([\d,]+(?:\.\d{1,2})?)/),
      statementDate: dateOf(statement?.[1]),
      period: from && to ? { from, to } : null,
    },
  };
}

// ───────────────────────── Matching unbilled transactions to statement lines ─────────────────────────

export interface UnbilledCandidate {
  id: string;
  occurredAt: Date;
  kind: "DEBIT" | "CREDIT";
  amountPaise: number;
  recipientIds: readonly string[];
}

export interface StatementCandidate {
  id: string;
  occurredAt: Date;
  kind: "DEBIT" | "CREDIT";
  amountPaise: number;
  recipientIds: readonly string[];
}

/** How many days the statement may be dated after the purchase (a card posts a transaction a few days later). */
export const MAX_POSTING_DAYS = 4;

const DAY = 86_400_000;
const dayNumber = (d: Date) => Math.floor((Date.parse(`${istDateOf(d)}T00:00:00Z`) || 0) / DAY);
/** A time of day is known unless it is exactly midnight (statements print 00:00 for charges with no time). */
const hasTime = (d: Date) => istTimeOf(d) !== "00:00";

/**
 * Whether an unbilled transaction is the one a statement line shows, and how good the match is (higher is better; null is no
 * match). The amount and the kind (debit or credit) must be equal. If the statement line has recipients they must be the same
 * people as the unbilled one. The statement may be dated up to MAX_POSTING_DAYS after the purchase, never before it. When both
 * have a time of day, the closer times score higher.
 */
export function matchScore(unbilled: UnbilledCandidate, statement: StatementCandidate): number | null {
  if (unbilled.kind !== statement.kind || unbilled.amountPaise !== statement.amountPaise) return null;

  if (statement.recipientIds.length > 0 || unbilled.recipientIds.length > 0) {
    const a = new Set(unbilled.recipientIds);
    const b = new Set(statement.recipientIds);
    if (a.size !== b.size || [...a].some((id) => !b.has(id))) return null;
  }

  const days = dayNumber(statement.occurredAt) - dayNumber(unbilled.occurredAt);
  if (days < 0 || days > MAX_POSTING_DAYS) return null;

  let score = 100 - days * 10;
  if (hasTime(unbilled.occurredAt) && hasTime(statement.occurredAt)) {
    const minutes = Math.abs(statement.occurredAt.getTime() - unbilled.occurredAt.getTime()) / 60_000;
    score += minutes <= 5 ? 5 : minutes <= 60 ? 2 : 0;
  }
  return score;
}

/**
 * Pairs statement lines with unbilled transactions. Each unbilled transaction is used for one statement line at most and the
 * other way round, so nothing is counted twice. The best matches are paired first.
 */
export function reconcile(unbilled: readonly UnbilledCandidate[], statement: readonly StatementCandidate[]): { unbilledId: string; statementId: string }[] {
  const options: { u: string; s: string; score: number }[] = [];
  for (const u of unbilled) for (const s of statement) {
    const score = matchScore(u, s);
    if (score !== null) options.push({ u: u.id, s: s.id, score });
  }
  options.sort((a, b) => b.score - a.score);
  const usedU = new Set<string>();
  const usedS = new Set<string>();
  const pairs: { unbilledId: string; statementId: string }[] = [];
  for (const o of options) {
    if (usedU.has(o.u) || usedS.has(o.s)) continue;
    usedU.add(o.u);
    usedS.add(o.s);
    pairs.push({ unbilledId: o.u, statementId: o.s });
  }
  return pairs;
}

// ───────────────────────── Showing things ─────────────────────────

/** The credit bar: how much of the limit is used, as a percentage (0 to 100), and what is left. */
export function utilization(totalPaise: number, usedPaise: number): { usedPercent: number; balancePaise: number } {
  const balancePaise = Math.max(0, totalPaise - usedPaise);
  const usedPercent = totalPaise <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((usedPaise / totalPaise) * 1000) / 10));
  return { usedPercent, balancePaise };
}

/** "Mukesh" for one person, "Mukesh +3 More" for four. */
export function recipientSummary(names: readonly string[]): { first: string; more: number } {
  return { first: names[0] ?? "", more: Math.max(0, names.length - 1) };
}
