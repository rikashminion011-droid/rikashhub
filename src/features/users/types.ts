/** Shapes shared by the server and the browser. */

/** A person you can assign expenses to (the "To" and Split choices in Quick Entry). */
export interface PersonRow {
  id: string;
  name: string;
  /** How many expenses name this person. */
  expenseCount: number;
  /** Their total share across those expenses, in paise. */
  totalPaise: number;
}

export type UserActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; fieldErrors?: Record<string, string> };
