/**
 * The background of a transaction row, the same everywhere (GPay Transactions and Add Bulk): a debit is light red, a credit
 * light green, and a self transfer light yellow.
 */
export type RowKind = "DEBIT" | "CREDIT" | "TRANSFER";

const TONE: Record<RowKind, string> = {
  DEBIT: "bg-red-50 hover:bg-red-100/70",
  CREDIT: "bg-green-50 hover:bg-green-100/70",
  TRANSFER: "bg-yellow-50 hover:bg-yellow-100/70",
};

export const rowKindOf = (row: { type: "DEBIT" | "CREDIT"; transfer?: unknown }): RowKind => (row.transfer ? "TRANSFER" : row.type);

/** The classes for a saved transaction row. */
export const rowTone = (row: { type: "DEBIT" | "CREDIT"; transfer?: unknown }): string => TONE[rowKindOf(row)];

/** The classes for a row on the Add Bulk sheet, or none while the row is still empty. */
export const bulkRowTone = (kind: RowKind | null): string => (kind ? TONE[kind] : "");
