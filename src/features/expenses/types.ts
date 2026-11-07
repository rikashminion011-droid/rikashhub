/** Shapes shared by the server and the browser. No server-only imports here. */

export interface AccountOption {
  id: string;
  name: string;
}

export interface MethodOption {
  id: string;
  name: string;
  /** Wallet, bank, cash, credit line... shown as a small hint. */
  kind: "BANK" | "WALLET" | "CASH" | "CREDIT_LINE" | "OTHER";
  accounts: AccountOption[];
}

export interface NamedOption {
  id: string;
  name: string;
}

/** Everything the form needs to render its choices. */
export interface ExpenseFormData {
  methods: MethodOption[];
  parties: NamedOption[];
  categories: NamedOption[];
}

export interface RecentExpense {
  id: string;
  amountPaise: number;
  /** YYYY-MM-DD */
  date: string;
  notes: string;
  /** "GPay · Canara" or "HDFC" */
  paidWith: string;
  category: string;
  people: { name: string; amountPaise: number }[];
  isSplit: boolean;
}

export type MethodKind = MethodOption["kind"];

export const METHOD_KINDS: { value: MethodKind; label: string }[] = [
  { value: "BANK", label: "Bank" },
  { value: "WALLET", label: "Wallet / UPI" },
  { value: "CASH", label: "Cash" },
  { value: "CREDIT_LINE", label: "Credit line" },
  { value: "OTHER", label: "Other" },
];

export type OptionKind = "method" | "account" | "party" | "category";

/** What an option-changing action returns on success: the refreshed choices and what was touched. */
export interface OptionsResult {
  data: ExpenseFormData;
  /** Id of the option that was just added (so the form can select it). */
  createdId?: string;
}

export type ExpenseActionResult<T> = ({ ok: true } & T) | { ok: false; error: string; fieldErrors?: Record<string, string> };
