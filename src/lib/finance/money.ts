/**
 * Money helpers. All arithmetic in the finance engine is done in integer paise
 * (1 rupee = 100 paise) so there is never floating point drift.
 */

export type Paise = number;

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Round to 2 decimal places (used for percentages, not money). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Convert a rupee amount to paise without float error.
 * Accepts numbers, decimal strings and Prisma `Decimal` (anything with a decimal `toString()`).
 * More than 2 decimal places are rounded half away from zero.
 */
export function toPaise(value: number | string | { toString(): string }): Paise {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError("Amount must be a finite number");
    // toPrecision(15) strips binary noise such as 1.005 * 100 = 100.49999999999999
    return Math.round(Number((value * 100).toPrecision(15)));
  }
  const text = value.toString().trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new RangeError(`Invalid money amount: "${text}"`);
  const [, sign, whole, fraction = ""] = match;
  const padded = (fraction + "00").slice(0, 2);
  let paise = Number(whole) * 100 + Number(padded);
  if (fraction.length > 2 && Number(fraction[2]) >= 5) paise += 1;
  return sign === "-" ? -paise : paise;
}

/** Paise back to a 2-decimal rupee string suitable for a Decimal column, e.g. 123456 -> "1234.56". */
export function paiseToDecimalString(paise: Paise): string {
  assertInteger(paise);
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function paiseToRupees(paise: Paise): number {
  return paise / 100;
}

/** "₹1,23,456.78" (Indian lakh/crore grouping). */
export function formatINR(paise: Paise): string {
  return INR.format(paise / 100);
}

/** Compact form for charts and tiles: "₹1.25 Cr", "₹3.40 L", otherwise full format. */
export function formatINRCompact(paise: Paise): string {
  const rupees = Math.abs(paise) / 100;
  const sign = paise < 0 ? "-" : "";
  if (rupees >= 10_000_000) return `${sign}₹${trim(rupees / 10_000_000)} Cr`;
  if (rupees >= 100_000) return `${sign}₹${trim(rupees / 100_000)} L`;
  return formatINR(paise);
}

export function sumPaise(values: readonly Paise[]): Paise {
  return values.reduce((total, v) => total + v, 0);
}

export function assertInteger(paise: number): void {
  if (!Number.isInteger(paise)) throw new RangeError(`Paise must be an integer, got ${paise}`);
}

function trim(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, "");
}
