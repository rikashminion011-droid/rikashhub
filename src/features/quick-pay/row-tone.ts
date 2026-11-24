/**
 * The background of a transaction row, the same everywhere (Transaction History and Add Bulk): every kind of row is the plain
 * neutral background with a quiet hover. The kind shows in the colour of the amount alone (red for a debit, green for a credit).
 */
export type RowKind = "DEBIT" | "CREDIT" | "TRANSFER";

const TONE: Record<RowKind, string> = {
  DEBIT: "hover:bg-muted/40",
  CREDIT: "hover:bg-muted/40",
  TRANSFER: "hover:bg-muted/40",
};

export const rowKindOf = (row: { type: "DEBIT" | "CREDIT"; transfer?: unknown }): RowKind => (row.transfer ? "TRANSFER" : row.type);

/** The classes for a saved transaction row. */
export const rowTone = (row: { type: "DEBIT" | "CREDIT"; transfer?: unknown }): string => TONE[rowKindOf(row)];

/** The classes for a row on the Add Bulk sheet, or none while the row is still empty. */
export const bulkRowTone = (kind: RowKind | null): string => (kind ? TONE[kind] : "");
