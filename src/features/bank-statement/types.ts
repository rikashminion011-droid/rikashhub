/** One row of the Bank Statement page. */
export interface BsRow {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm; "00:00" means the statement has no time. */
  time: string;
  details: string;
  reason: string;
  categoryId: string | null;
  category: string;
  accountId: string;
  bank: string;
  debitPaise: number;
  creditPaise: number;
  balancePaise: number | null;
}

export interface BsTotals {
  count: number;
  debitPaise: number;
  creditPaise: number;
}

export interface BsPage {
  rows: BsRow[];
  totals: BsTotals;
  page: number;
  pageCount: number;
  /** How many rows are debits and credits among those matching everything except the Type filter. */
  typeCounts: { debit: number; credit: number };
}

export interface BsPreviewRow {
  date: string;
  time: string;
  details: string;
  debitPaise: number;
  creditPaise: number;
  balancePaise: number | null;
}
