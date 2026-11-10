import type { MethodKind } from "@/features/expenses/types";
import type { BalanceGroup } from "./balances";
import type { EntryType } from "./validation";

/** Shapes shared by the server and the browser. */

/** A bank you can pick in Quick Entry: always a leaf ("GPay → HDFC", or "Cash" when it has no accounts). */
export interface BankOption {
  id: string;
  /** "GPay → HDFC" */
  label: string;
  mainName: string;
  name: string;
}

/** A category you can pick: a main ("Food") or a sub-category ("Food → Dosa"). */
export interface CategoryOption {
  id: string;
  label: string;
  mainName: string;
  name: string;
  isSub: boolean;
}

export interface PersonOption {
  id: string;
  name: string;
}

export interface QuickPayOptions {
  banks: BankOption[];
  categories: CategoryOption[];
  persons: PersonOption[];
}

export interface BankTreeNode {
  id: string;
  name: string;
  kind: MethodKind;
  accounts: { id: string; name: string }[];
}

export interface CategoryTreeNode {
  id: string;
  name: string;
  subs: { id: string; name: string }[];
}

/** One saved Quick Pay entry, ready to load into the form. */
export interface EntryDetails {
  id: string;
  type: EntryType;
  amountPaise: number;
  reason: string;
  accountId: string;
  categoryId: string | null;
  partyId: string | null;
  /** ISO instant */
  occurredAt: string;
}

export interface TxRow {
  id: string;
  /** ISO instant */
  occurredAt: string;
  type: EntryType;
  amountPaise: number;
  reason: string;
  bank: string;
  category: string;
  person: string | null;
}

export interface TxTotals {
  debitPaise: number;
  creditPaise: number;
  count: number;
}

export interface RecentCredit {
  id: string;
  amountPaise: number;
  reason: string;
  occurredAt: string;
}

export interface BalancesData {
  groups: BalanceGroup[];
  totalCurrentPaise: number;
}

export type QuickPayResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; fieldErrors?: Record<string, string> };
