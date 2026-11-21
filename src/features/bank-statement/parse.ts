import type { TextRun } from "@/features/quick-pay/import/gpay-statement";

/**
 * Reads the rows of a bank statement, whichever bank it is from. Three kinds of file are understood:
 *   - CSV and Excel: a table whose header row names the columns (Date, Narration / Description / Particulars, Debit /
 *     Withdrawal, Credit / Deposit or one Amount with Dr / Cr, Balance). The header can sit below a few lines of bank details.
 *   - PDF: every line that starts with a date. The last number of the line is the balance and the one before it the amount;
 *     whether it is a debit or a credit is worked out from how the balance moved.
 * Everything here is pure: the route reads the file and hands over cells or text runs.
 */

export interface ParsedBankRow {
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm, "00:00" when the statement has no time. */
  time: string;
  details: string;
  debitPaise: number;
  creditPaise: number;
  balancePaise: number | null;
}

export interface BankParseFailure {
  /** The text of the line or row that could not be read. */
  text: string;
  error: string;
}

export interface BankParseResult {
  rows: ParsedBankRow[];
  failures: BankParseFailure[];
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

function iso(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

/** A date written as 05/11/2026, 05-11-26, 05.11.2026, 05 Nov 2026, 05-Nov-2026, 2026-11-05 or an Excel serial number. */
export function parseBankDate(text: string): string | null {
  const t = text.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(t);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{2}|\d{4})(?:[ ,T].*)?$/.exec(t);
  if (m) return iso(fullYear(Number(m[3])), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})[/\-. ,]*([A-Za-z]{3,9})[/\-. ,]*(\d{2}|\d{4})(?:[ ,T].*)?$/.exec(t);
  if (m) {
    const month = MONTHS[m[2]!.toLowerCase().slice(0, m[2]!.toLowerCase().startsWith("sept") ? 4 : 3)];
    return month ? iso(fullYear(Number(m[3])), month, Number(m[1])) : null;
  }
  // An Excel date that came through as a number of days.
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const days = Math.floor(Number(t));
    if (days > 30000 && days < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + days * 86_400_000);
      return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }
  return null;
}

/** "10:48", "10:48:12" or "10:48 PM" as HH:mm. */
export function parseBankTime(text: string): string | null {
  const m = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/.exec(text);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) {
    const pm = m[3].toLowerCase() === "pm";
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  return h > 23 || min > 59 ? null : `${pad(h)}:${pad(min)}`;
}

/** An amount like "1,234.50", "₹ 500", "(250.00)", "-90" or "1,000.00 Cr" as signed paise, or null when it is not one. */
export function parseMoney(text: string): { paise: number; marker: "DR" | "CR" | null } | null {
  let t = text.replace(/[₹\s]/g, "").replace(/^Rs\.?/i, "");
  if (t === "") return null;
  let marker: "DR" | "CR" | null = null;
  const tail = /(Dr|Cr|D|C)\.?$/i.exec(t);
  if (tail && /\d/.test(t.slice(0, tail.index))) {
    marker = tail[1]!.toLowerCase().startsWith("d") ? "DR" : "CR";
    t = t.slice(0, tail.index);
  }
  let negative = false;
  if (t.startsWith("(") && t.endsWith(")")) {
    negative = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-")) {
    negative = !negative;
    t = t.slice(1);
  }
  t = t.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  const paise = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(paise) ? { paise: negative ? -paise : paise, marker } : null;
}

// ───────────────────────── CSV ─────────────────────────

/** Splits CSV text into cells, honouring quotes. The separator (comma, semicolon, tab or pipe) is found from the first lines. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const sample = clean.split(/\r?\n/).slice(0, 30).join("\n");
  const sep = ([",", ";", "\t", "|"] as const).map((s) => ({ s, n: sample.split(s).length })).sort((a, b) => b.n - a.n)[0]!.s;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

// ───────────────────────── Tables (CSV and Excel) ─────────────────────────

interface Columns {
  date: number;
  time: number;
  details: number[];
  debit: number;
  credit: number;
  amount: number;
  type: number;
  balance: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/ ]+/g, " ").replace(/\s+/g, " ").trim();

function findColumns(header: readonly string[]): Columns | null {
  const h = header.map(norm);
  const idx = (test: (s: string) => boolean) => h.findIndex(test);
  // A transaction date is preferred to a value date.
  const date = (() => {
    const a = idx((s) => /^(txn|transaction|trans|posting|tran)\.? ?date$/.test(s) || s === "date");
    return a >= 0 ? a : idx((s) => /date/.test(s) && !/value/.test(s)) >= 0 ? idx((s) => /date/.test(s) && !/value/.test(s)) : idx((s) => /date/.test(s));
  })();
  const details = h.flatMap((s, i) => (/narration|description|particulars|remarks|details|transaction details|beneficiary/.test(s) && !/date|balance/.test(s) ? [i] : []));
  const debit = idx((s) => /(debit|withdrawal|withdrawals|paid out|dr amount|amount dr)/.test(s) && !/balance/.test(s));
  const credit = idx((s) => /(credit|deposit|deposits|paid in|cr amount|amount cr)/.test(s) && !/balance|card/.test(s));
  const amount = idx((s) => /^(transaction )?amount( inr)?( rs)?$/.test(s) || s === "amt");
  const type = idx((s) => /^(dr ?\/ ?cr|cr ?\/ ?dr|type|transaction type|dr cr)$/.test(s));
  const balance = idx((s) => /balance/.test(s));
  const time = idx((s) => /^(txn |transaction )?time$/.test(s));
  if (date < 0 || details.length === 0) return null;
  if (debit < 0 && credit < 0 && amount < 0) return null;
  return { date, time, details, debit, credit, amount, type, balance };
}

/** Rows read from a table of cells. The header row is looked for in the first 80 rows. */
export function parseBankTable(grid: readonly (readonly string[])[]): BankParseResult {
  let columns: Columns | null = null;
  let start = 0;
  for (let i = 0; i < Math.min(grid.length, 80); i++) {
    const found = findColumns(grid[i]!);
    if (found) {
      columns = found;
      start = i + 1;
      break;
    }
  }
  if (!columns) return { rows: [], failures: [{ text: "", error: "The header row was not found. The statement needs columns for the date, the narration or description, and the debit and credit (or amount)." }] };

  const rows: ParsedBankRow[] = [];
  const failures: BankParseFailure[] = [];
  for (let i = start; i < grid.length; i++) {
    const r = grid[i]!;
    const cell = (c: number) => (c >= 0 ? (r[c] ?? "").toString().trim() : "");
    const date = parseBankDate(cell(columns.date));
    const text = r.map((x) => (x ?? "").toString().trim()).filter(Boolean).join(" | ");
    if (!date) {
      // Totals and footers have no date; a row that has other text but no readable date is worth showing.
      if (text && /\d/.test(cell(columns.date))) failures.push({ text, error: "The date could not be read." });
      continue;
    }
    const details = columns.details.map(cell).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    let debit = 0;
    let credit = 0;
    const d = columns.debit >= 0 ? parseMoney(cell(columns.debit)) : null;
    const c = columns.credit >= 0 ? parseMoney(cell(columns.credit)) : null;
    if (d && d.paise !== 0) debit = Math.abs(d.paise);
    if (c && c.paise !== 0) credit = Math.abs(c.paise);
    if (debit === 0 && credit === 0 && columns.amount >= 0) {
      const a = parseMoney(cell(columns.amount));
      const kind = columns.type >= 0 ? cell(columns.type).toLowerCase() : "";
      if (a && a.paise !== 0) {
        const isCredit = a.marker === "CR" || /^c|credit|deposit/.test(kind) ? true : a.marker === "DR" || /^d|debit|withdraw/.test(kind) ? false : a.paise > 0;
        if (isCredit) credit = Math.abs(a.paise);
        else debit = Math.abs(a.paise);
      }
    }
    if (debit === 0 && credit === 0) {
      failures.push({ text, error: "No amount was found." });
      continue;
    }
    const bal = columns.balance >= 0 ? parseMoney(cell(columns.balance)) : null;
    rows.push({
      date,
      time: (columns.time >= 0 ? parseBankTime(cell(columns.time)) : null) ?? "00:00",
      details: details || "(no details)",
      debitPaise: debit,
      creditPaise: credit,
      balancePaise: bal ? (bal.marker === "DR" ? -Math.abs(bal.paise) : bal.paise) : null,
    });
  }
  return { rows, failures };
}

// ───────────────────────── PDF ─────────────────────────

const LINE_DATE = /^(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{1,2}[ \-][A-Za-z]{3,9}[ ,\-]*\d{2,4}|\d{4}-\d{2}-\d{2})\b/;
const MONEY_TOKEN = /^\(?-?₹?\s*\d[\d,]*\.\d{2}\)?(?:\s?(?:Cr|Dr|CR|DR))?$/;

/** The text lines of each page: runs on the same height are joined from left to right. */
export function linesOfRuns(pages: readonly (readonly TextRun[])[]): string[] {
  const lines: string[] = [];
  for (const runs of pages) {
    const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
    let current: TextRun[] = [];
    let y = Number.NaN;
    const flush = () => {
      if (current.length > 0) lines.push(current.sort((a, b) => a.x - b.x).map((r) => r.str.trim()).join(" ").replace(/\s+/g, " ").trim());
      current = [];
    };
    for (const run of sorted) {
      if (Number.isNaN(y) || Math.abs(run.y - y) > 2.5) {
        flush();
        y = run.y;
      }
      current.push(run);
    }
    flush();
  }
  return lines;
}

const CREDIT_HINT = /\b(cr|credit|deposit|salary|interest|refund|reversal|received|neft cr|imps cr|upi\/cr|by transfer|by clg)\b/i;

/** Lines that are headings, footers or page furniture, never part of a narration. */
const NOISE = /^(page\b|private\b|statement\b|date\b|transaction date|opening balance|closing balance|total\b|account\b|branch\b|ifsc|customer|generated|registered office|this is a computer|contents of|\*|hdfc bank limited|state account|\.)/i;
/** After these the table is over (the summary and the bank's small print follow). */
const END = /^\*?\s*(statement summary|\*\*\* end|registered office|this is a computer|this is an auto|contents of this statement|\*closing balance)/i;

/** The balance before the first row: an "Opening Balance 181.80" line, or HDFC's summary table. */
export function openingBalanceOf(lines: readonly string[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = /^Opening Balance\s+(-?[\d,]+\.\d{2})\s*(Cr|Dr)?$/i.exec(line);
    if (m) {
      const money = parseMoney(m[1]!);
      return money ? (m[2]?.toLowerCase() === "dr" ? -money.paise : money.paise) : null;
    }
    if (/^Opening Balance\s+Dr Count/i.test(line) && lines[i + 1]) {
      const first = lines[i + 1]!.split(" ")[0]!;
      const money = parseMoney(first);
      if (money) return money.paise;
    }
  }
  return null;
}

const SECOND_DATE = /^(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{1,2}[ -][A-Za-z]{3,9}[ -]\d{2,4})\s+/;

/** The numbers at the end of a text: [amount, balance] (or just [amount]), and where they start. */
function trailingMoney(tokens: readonly string[]): { nums: { paise: number; marker: "DR" | "CR" | null }[]; cut: number } {
  const nums: { paise: number; marker: "DR" | "CR" | null }[] = [];
  let cut = tokens.length;
  for (let i = tokens.length - 1; i >= 0 && nums.length < 3; i--) {
    const two = i > 0 ? `${tokens[i - 1]} ${tokens[i]}` : "";
    const token = MONEY_TOKEN.test(tokens[i]!) ? tokens[i]! : MONEY_TOKEN.test(two) ? two : null;
    if (!token) {
      if (nums.length > 0) break;
      continue;
    }
    const money = parseMoney(token);
    if (!money) break;
    nums.unshift({ paise: money.paise, marker: money.marker });
    cut = token === two ? i - 1 : i;
    if (token === two) i--;
  }
  return { nums, cut };
}

interface Draft {
  date: string;
  time: string;
  text: string;
  amountPaise: number;
  balancePaise: number | null;
  marker: "DR" | "CR" | null;
}

/** Turns drafts into rows. Debit or credit comes from the balance moving (a rise is a credit), else a Dr / Cr mark or the wording. */
function settle(drafts: readonly Draft[], opening: number | null): ParsedBankRow[] {
  const rows: ParsedBankRow[] = [];
  let previous: number | null = opening;
  for (const d of drafts) {
    let credit: boolean;
    if (previous !== null && d.balancePaise !== null && d.amountPaise > 0 && Math.abs(d.balancePaise - previous) === d.amountPaise) credit = d.balancePaise > previous;
    else if (d.marker) credit = d.marker === "CR";
    else credit = CREDIT_HINT.test(d.text);
    if (d.balancePaise !== null) previous = d.balancePaise;
    rows.push({ date: d.date, time: d.time, details: d.text.replace(/\s+/g, " ").trim() || "(no details)", debitPaise: credit ? 0 : d.amountPaise, creditPaise: credit ? d.amountPaise : 0, balancePaise: d.balancePaise });
  }
  return rows;
}

const TIME_IN_TEXT = /\b(\d{2}:\d{2}):\d{2}\b/;

/**
 * Canara's passbook: each transaction is a block of lines that ends with "Chq: <number>". The narration is spread over the
 * lines before and after the line that holds the date and the amounts, so the whole block is read as one.
 */
function parseChqBlocks(lines: readonly string[]): BankParseResult {
  const drafts: Draft[] = [];
  const failures: BankParseFailure[] = [];
  let block: string[] = [];
  for (const line of lines) {
    if (/^(Date\s+Particulars|page \d+|Opening Balance|Statement for)/i.test(line)) {
      block = [];
      continue;
    }
    if (!/^Chq:/i.test(line)) {
      block.push(line);
      continue;
    }
    const at = block.findIndex((l) => LINE_DATE.test(l) && trailingMoney(l.replace(LINE_DATE, "").trim().split(" ")).nums.length >= 1);
    if (at < 0) {
      if (block.length > 0) failures.push({ text: block.join(" ").slice(0, 200), error: "No date and amount were found in this entry." });
      block = [];
      continue;
    }
    const dated = block[at]!;
    const m = LINE_DATE.exec(dated)!;
    const date = parseBankDate(m[1]!);
    const rest = dated.slice(m[0].length).trim().split(" ");
    const { nums, cut } = trailingMoney(rest);
    const balance = nums.length >= 2 ? nums[nums.length - 1]! : null;
    const amount = nums.length >= 2 ? nums[nums.length - 2]! : nums[0]!;
    const text = [...block.slice(0, at), rest.slice(0, cut).join(" "), ...block.slice(at + 1)].join(" ");
    const time = TIME_IN_TEXT.exec(text)?.[1] ?? "00:00";
    if (!date) failures.push({ text: dated, error: "The date could not be read." });
    else drafts.push({ date, time, text: text.replace(/\s\d{2}:\d{2}:\d{2}\b/g, "").replace(/\s+/g, " ").trim(), amountPaise: Math.abs(amount.paise), balancePaise: balance ? balance.paise : null, marker: amount.marker });
    block = [];
  }
  return { rows: settle(drafts, openingBalanceOf(lines)), failures };
}

/** Rows read from the text lines of a bank statement PDF. */
export function parseBankLines(lines: readonly string[]): BankParseResult {
  if (lines.some((l) => /^Chq:\s*\d+/i.test(l))) return parseChqBlocks(lines);

  const drafts: Draft[] = [];
  const failures: BankParseFailure[] = [];
  let over = false;

  for (const line of lines) {
    const m = LINE_DATE.exec(line);
    if (!m) {
      if (END.test(line)) over = true;
      // A continuation of the previous narration (not a heading, a footer or a page number).
      const prev = drafts.at(-1);
      if (prev && !over && line.length > 1 && !NOISE.test(line) && !/\d[\d,]*\.\d{2}/.test(line)) prev.text += ` ${line}`;
      continue;
    }
    over = false;
    const date = parseBankDate(m[1]!.replace(/,/g, " "));
    if (!date) continue;
    let rest = line.slice(m[0].length).trim();
    // The value date that follows the transaction date is not part of the narration.
    rest = rest.replace(SECOND_DATE, "");
    const tokens = rest.split(" ");
    const { nums, cut } = trailingMoney(tokens);
    if (nums.length === 0) {
      failures.push({ text: line, error: "No amount was found on this line." });
      continue;
    }
    const balance = nums.length >= 2 ? nums[nums.length - 1]! : null;
    const amount = nums.length >= 2 ? nums[nums.length - 2]! : nums[0]!;
    // HDFC puts the value date after the reference number, just before the amounts.
    const details = tokens.slice(0, cut).join(" ").replace(/\s+\d{2}\/\d{2}\/\d{2,4}$/, "").trim();
    drafts.push({ date, time: "00:00", text: details, amountPaise: Math.abs(amount.paise), balancePaise: balance ? (balance.marker === "DR" ? -Math.abs(balance.paise) : balance.paise) : null, marker: amount.marker });
  }
  return { rows: settle(drafts, openingBalanceOf(lines)), failures };
}
