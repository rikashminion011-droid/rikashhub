import { istInstant } from "../datetime";

/**
 * Reads the "Transaction statement" PDF that the Google Pay app exports.
 *
 * Layout of every transaction (found by reading the real file; each block is three lines):
 *   01 May, 2026 | Received from Candy Dhanush | ₹400         <- date, details, amount
 *   10:48 AM     | UPI Transaction ID: 612110414150
 *                |   Paid to IDFC FIRST Bank 1960             <- the bank: "Paid to" = money came in,
 *                                                                "Paid by" = money went out
 * Details are "Paid to <name>", "Received from <name>" or "Self transfer to <bank>". A long name can sit in a second
 * text run on the same line, so the text of a line is rebuilt from its runs, left to right.
 *
 * The functions here are pure: they take text runs with positions (see pdf-text.ts) and return rows.
 */

export interface TextRun {
  str: string;
  x: number;
  y: number;
}

export type GpayKind = "DEBIT" | "CREDIT" | "SELF_TRANSFER";

export interface ParsedGpayRow {
  /** The UPI Transaction ID: the same payment always has the same one, which is how re-imports are recognised. */
  id: string;
  kind: GpayKind;
  /** ISO instant (the statement's date and time are India time). */
  occurredAt: string;
  amountPaise: number;
  /** The other party: a person or shop, or for a self transfer the bank it went to. */
  counterparty: string;
  /** What is saved as the Reason: "Paid to Indian Railways", "Received from Anith Priya", "Self transfer to Canara Bank 5109". */
  reason: string;
  /** The statement's name for the account used, e.g. "IDFC FIRST Bank 1960" (debit: paid from, credit: received in, transfer: paid from). */
  bank: string;
  /** Self transfers only: the statement's name for the account that received the money. */
  toBank: string | null;
  page: number;
}

export interface ParseFailure {
  page: number;
  /** The text found for the block, so the problem can be seen. */
  text: string;
  error: string;
}

export interface ParsedStatement {
  rows: ParsedGpayRow[];
  failures: ParseFailure[];
  /** "01 May 2026 - 31 October 2026" as inclusive YYYY-MM-DD dates, when the cover shows it. */
  period: { from: string; to: string } | null;
  /** The totals printed on the first page, for checking the rows against. */
  sentPaise: number | null;
  receivedPaise: number | null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const DATE_RE = /^(\d{1,2}) ([A-Za-z]{3}),? (\d{4})$/;
const TIME_RE = /^(\d{1,2}):(\d{2}) ([AP]M)$/i;
const UPI_RE = /^UPI Transaction ID:\s*(\d+)$/;
const AMOUNT_RE = /^[-+]?\s*₹\s*([\d,]+(?:\.\d{1,2})?)$/;
const PERIOD_RE = /^(\d{1,2}) ([A-Za-z]+) (\d{4}) - (\d{1,2}) ([A-Za-z]+) (\d{4})$/;

/** Column positions on the page (points from the left). The date column is at the far left, the amount at the right. */
const COL_DETAILS = 100;
const COL_AMOUNT = 480;

const pad = (n: number) => String(n).padStart(2, "0");

export function parseAmountPaise(text: string): number | null {
  const m = AMOUNT_RE.exec(text.trim());
  if (!m) return null;
  const [whole, frac = ""] = m[1]!.replace(/,/g, "").split(".");
  const paise = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(paise) ? paise : null;
}

/** "01 May, 2026" and "10:48 AM" to an instant, or null when either is not a real date and time. */
export function parseWhen(dateText: string, timeText: string): Date | null {
  const d = DATE_RE.exec(dateText.trim());
  const t = TIME_RE.exec(timeText.trim());
  if (!d || !t) return null;
  const month = MONTHS[d[2]!.toLowerCase()];
  if (!month) return null;
  let hour = Number(t[1]);
  const minute = Number(t[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (t[3]!.toUpperCase() === "AM") hour = hour === 12 ? 0 : hour;
  else hour = hour === 12 ? 12 : hour + 12;
  const iso = `${d[3]}-${pad(month)}-${pad(Number(d[1]))}`;
  try {
    const instant = istInstant(iso, `${pad(hour)}:${pad(minute)}`);
    // istInstant accepts 31 Feb by rolling over; reject that.
    return Number.isNaN(instant.getTime()) || new Date(instant.getTime() + 330 * 60_000).toISOString().slice(0, 10) !== iso ? null : instant;
  } catch {
    return null;
  }
}

interface Line {
  y: number;
  runs: TextRun[];
}

/** Groups the text runs of one page into lines (same y within 2 points), top of the page first, runs left to right. */
function toLines(runs: readonly TextRun[]): Line[] {
  const sorted = runs.filter((r) => r.str.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const run of sorted) {
    const last = lines.at(-1);
    if (last && Math.abs(last.y - run.y) <= 2) last.runs.push(run);
    else lines.push({ y: run.y, runs: [run] });
  }
  for (const line of lines) line.runs.sort((a, b) => a.x - b.x);
  return lines;
}

const join = (runs: readonly TextRun[]) => runs.map((r) => r.str.trim()).join(" ").replace(/\s+/g, " ").trim();

interface Draft {
  page: number;
  date?: string;
  time?: string;
  details?: string;
  amount?: string;
  upi?: string;
  bankLine?: string;
  text: string[];
}

function finish(draft: Draft): ParsedGpayRow | ParseFailure {
  const fail = (error: string): ParseFailure => ({ page: draft.page, text: draft.text.join(" | "), error });

  if (!draft.date || !draft.time) return fail("The date or time is missing.");
  const when = parseWhen(draft.date, draft.time);
  if (!when) return fail(`"${draft.date} ${draft.time}" is not a valid date and time.`);
  if (!draft.amount) return fail("The amount is missing.");
  const amountPaise = parseAmountPaise(draft.amount);
  if (amountPaise === null || amountPaise <= 0) return fail(`"${draft.amount}" is not a valid amount.`);
  if (!draft.upi) return fail("The UPI Transaction ID is missing.");
  if (!draft.details) return fail("The transaction details are missing.");
  if (!draft.bankLine) return fail("The bank is missing.");

  const bankLine = /^(Paid to|Paid by) (.+)$/.exec(draft.bankLine);
  if (!bankLine) return fail(`Could not read the bank from "${draft.bankLine}".`);
  const direction = bankLine[1]!;
  const bank = bankLine[2]!.trim();

  const base = { id: draft.upi, occurredAt: when.toISOString(), amountPaise, page: draft.page };
  const self = /^Self transfer to\s*(.*)$/.exec(draft.details);
  if (self) {
    if (direction !== "Paid by") return fail("A self transfer must show the bank it was paid from.");
    const toBank = self[1]!.trim();
    return { ...base, kind: "SELF_TRANSFER", counterparty: toBank, reason: `Self transfer to ${toBank}`.trim(), bank, toBank: toBank || null };
  }
  const received = /^Received from\s*(.*)$/.exec(draft.details);
  if (received) {
    if (direction !== "Paid to") return fail("A received payment must show the bank it was paid to.");
    return { ...base, kind: "CREDIT", counterparty: received[1]!.trim(), reason: draft.details.trim(), bank, toBank: null };
  }
  const paid = /^Paid to\s*(.*)$/.exec(draft.details);
  if (paid) {
    if (direction !== "Paid by") return fail("A payment must show the bank it was paid by.");
    return { ...base, kind: "DEBIT", counterparty: paid[1]!.trim(), reason: draft.details.trim(), bank, toBank: null };
  }
  return fail(`Unknown kind of transaction: "${draft.details}".`);
}

/**
 * Parses the pages of a Google Pay statement. `pages[i]` holds the text runs of page i + 1.
 * Every block that cannot be read becomes a failure with its text, so nothing is skipped silently.
 */
export function parseGpayStatement(pages: readonly (readonly TextRun[])[]): ParsedStatement {
  const rows: ParsedGpayRow[] = [];
  const failures: ParseFailure[] = [];
  let period: ParsedStatement["period"] = null;
  let sentPaise: number | null = null;
  let receivedPaise: number | null = null;

  let draft: Draft | null = null;
  const close = () => {
    if (!draft) return;
    const result = finish(draft);
    if ("error" in result) failures.push(result);
    else rows.push(result);
    draft = null;
  };

  pages.forEach((runs, pageIndex) => {
    const page = pageIndex + 1;
    const lines = toLines(runs);

    if (page === 1) {
      // The cover: the period, then Sent and Received totals.
      for (const line of lines) {
        // The period shares its line with the amounts at the right, so read only the left part.
        const text = join(line.runs.filter((r) => r.x < 290));
        const p = PERIOD_RE.exec(text);
        if (!p) continue;
        const month = (name: string) => MONTHS[name.slice(0, 3).toLowerCase()];
        const m1 = month(p[2]!);
        const m2 = month(p[5]!);
        if (m1 && m2) period = { from: `${p[3]}-${pad(m1)}-${pad(Number(p[1]))}`, to: `${p[6]}-${pad(m2)}-${pad(Number(p[4]))}` };
      }
      const heading = lines.find((l) => l.runs.some((r) => r.str.trim() === "Sent") && l.runs.some((r) => r.str.trim() === "Received"));
      if (heading) {
        const below = lines.find((l) => l.y < heading.y && l.y > heading.y - 40 && l.runs.some((r) => AMOUNT_RE.test(r.str.trim())));
        const amounts = below?.runs.filter((r) => AMOUNT_RE.test(r.str.trim())) ?? [];
        if (amounts[0]) sentPaise = parseAmountPaise(amounts[0].str);
        if (amounts[1]) receivedPaise = parseAmountPaise(amounts[1].str);
      }
    }

    for (const line of lines) {
      const left = line.runs.filter((r) => r.x < COL_DETAILS);
      const middle = line.runs.filter((r) => r.x >= COL_DETAILS && r.x < COL_AMOUNT);
      const right = line.runs.filter((r) => r.x >= COL_AMOUNT);
      const leftText = join(left);
      const middleText = join(middle);
      const rightText = join(right);

      if (DATE_RE.test(leftText)) {
        close();
        draft = { page, date: leftText, details: middleText, amount: AMOUNT_RE.test(rightText) ? rightText : undefined, text: [join(line.runs)] };
        continue;
      }
      if (!draft) continue; // page headings, notes and the cover before the first transaction

      if (TIME_RE.test(leftText)) {
        draft.time = leftText;
        const upi = UPI_RE.exec(middleText);
        if (upi) draft.upi = upi[1];
        else if (middleText) draft.details = `${draft.details ?? ""} ${middleText}`.trim(); // a long name that wrapped onto this line
        draft.text.push(join(line.runs));
        continue;
      }
      if (/^(Paid to|Paid by) /.test(middleText) && draft.upi) {
        draft.bankLine = middleText;
        draft.text.push(join(line.runs));
        continue;
      }
      // Anything else inside a block is a wrapped name; page headings (no date, no draft context) were skipped above.
      if (middleText && !draft.bankLine && !/^Transaction details$/.test(middleText) && !/^Page \d+ of \d+$/.test(middleText)) {
        const upi = UPI_RE.exec(middleText);
        if (upi) draft.upi = upi[1];
        else draft.details = `${draft.details ?? ""} ${middleText}`.trim();
        draft.text.push(join(line.runs));
      }
    }
    // A block never continues onto the next page in this layout, so close it here.
    close();
  });
  close();

  return { rows, failures, period, sentPaise, receivedPaise };
}

/** A short, human description for a row, e.g. for the preview table. */
export function describeKind(kind: GpayKind): string {
  return kind === "DEBIT" ? "Debit" : kind === "CREDIT" ? "Credit" : "Self transfer";
}
