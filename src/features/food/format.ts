const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
const dayFormat = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "long" });
const monthFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" });

/** "25 Jun 2026, 9:21 AM" in IST. */
export function formatDateTime(instant: Date): string {
  return `${dateFormat.format(instant)}, ${timeFormat.format(instant).replace(/[  ]/g, " ")}`;
}

/** The weekday of the instant in IST, worked out from the date itself ("Thursday"). */
export function formatWeekday(instant: Date): string {
  return dayFormat.format(instant);
}

/** "2026-06" gives "June 2026". */
export function formatMonth(month: string): string {
  return monthFormat.format(new Date(`${month}-01T00:00:00.000Z`));
}

/** The month key ("2026-06") an instant falls in, in IST. */
export function monthOf(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(instant);
  return parts.slice(0, 7);
}

/** The first or last month shift: addMonths("2026-01", -1) is "2025-12". */
export function addMonths(month: string, delta: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5)) - 1 + delta;
  const year = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${year}-${String(mm + 1).padStart(2, "0")}`;
}
