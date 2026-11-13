import type { MethodKind } from "@/features/expenses/types";
import type { BalanceGroup } from "./balances";
import type { KeywordEntry } from "./keywords";
import type { QuickPaySettingsData } from "./settings-model";
import type { SplitKind } from "./shares";
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

/** One person's part of a shared transaction. */
export interface ShareDetail {
  partyId: string;
  name: string;
  /** Their share as a percentage of the amount. */
  percent: number;
  sharePaise: number;
}

export interface QuickPayOptions {
  banks: BankOption[];
  categories: CategoryOption[];
  persons: PersonOption[];
  /** Words that pick a category from the Reason. */
  keywords: KeywordEntry[];
  /** Field labels, defaults, Split and Credits Added settings. */
  settings: QuickPaySettingsData;
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
  keywords: string[];
  subs: { id: string; name: string; keywords: string[] }[];
}

/** One saved Quick Pay entry, ready to load into the form. */
export interface EntryDetails {
  id: string;
  type: EntryType;
  amountPaise: number;
  reason: string;
  accountId: string;
  categoryId: string | null;
  /** Split or Debt when shared with people, otherwise null. */
  splitKind: SplitKind | null;
  /** The people it is shared with, each with their share. */
  shares: ShareDetail[];
  /** Credits added to this debit, newest first. */
  creditIds: string[];
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
  /** What an imported statement said ("Paid to Indian Railways"); empty for entries you typed. */
  details: string;
  /** "GPay → Canara" (used in exports and search). */
  bank: string;
  /** Just "Canara": what the table shows. */
  bankName: string;
  bankId: string | null;
  category: string;
  categoryId: string | null;
  /** Set for a self transfer: the bank the money left and the bank it went to. Such a row is neither a debit nor a credit. */
  transfer: { from: string; to: string } | null;
  /** Split or Debt when shared with people, otherwise null. */
  splitKind: SplitKind | null;
  /** The people it is shared with, each with their share. */
  shares: ShareDetail[];
  /** Total of the credits added to this debit, in paise (0 when none). */
  linkedCreditsPaise: number;
}

export interface TxTotals {
  debitPaise: number;
  creditPaise: number;
  count: number;
}

export interface RecentCredit {
  id: string;
  /** CREDIT for money in; DEBIT appears when Credits Added is set to show recent transactions. */
  type: EntryType;
  amountPaise: number;
  reason: string;
  occurredAt: string;
}

export interface BalancesData {
  groups: BalanceGroup[];
  totalCurrentPaise: number;
}

export type QuickPayResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; fieldErrors?: Record<string, string> };
