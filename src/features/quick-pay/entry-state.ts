import { matchCategory } from "./keywords";
import type { QuickPaySettingsData } from "./settings-model";
import type { SplitMethod } from "./split";
import type { EntryDetails, QuickPayOptions, RecentCredit } from "./types";
import type { EntryType } from "./validation";

/**
 * The state of the Quick Entry form, shared by the page form and the edit pop-up, and the rules for filling it:
 * defaults from Customized Settings, the category picked from the Reason, and Credits Added choices.
 */

export interface FormState {
  amount: string;
  type: EntryType;
  reason: string;
  accountId: string | null;
  categoryId: string | null;
  /** True once you picked or cleared the category yourself: from then on a keyword never changes it. */
  categoryManual: boolean;
  /** True while the category on screen was chosen by a keyword (so it can follow the Reason as you type). */
  categoryAuto: boolean;
  splitEnabled: boolean;
  partyId: string | null;
  splitMethod: SplitMethod;
  /** A percentage ("50") or, for FIXED, an amount ("200"). */
  splitValue: string;
  creditsAdded: boolean;
  creditIds: string[];
}

const rupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

/** A new, empty form, with the defaults chosen in Customized Settings. */
export function emptyState(settings: QuickPaySettingsData, options?: Pick<QuickPayOptions, "banks" | "categories" | "persons">): FormState {
  const { fields, split } = settings;
  // A default that has since been removed is ignored instead of leaving a dead selection.
  const bank = options && fields.defaults.bankId && !options.banks.some((b) => b.id === fields.defaults.bankId) ? null : fields.defaults.bankId;
  const category = options && fields.defaults.categoryId && !options.categories.some((c) => c.id === fields.defaults.categoryId) ? null : fields.defaults.categoryId;
  const party = options && split.defaultPartyId && !options.persons.some((p) => p.id === split.defaultPartyId) ? null : split.defaultPartyId;
  return {
    amount: "",
    type: fields.defaults.type,
    reason: "",
    accountId: bank,
    categoryId: category,
    categoryManual: false,
    categoryAuto: false,
    splitEnabled: split.enabledByDefault,
    partyId: split.enabledByDefault ? party : null,
    splitMethod: split.method,
    splitValue: split.method === "PERCENT" ? String(split.defaultPercent) : split.defaultFixedPaise > 0 ? rupees(split.defaultFixedPaise) : "",
    creditsAdded: false,
    creditIds: [],
  };
}

/** The form filled from a saved entry (for editing). Its category counts as chosen by you. */
export function fromEntry(entry: EntryDetails, settings: QuickPaySettingsData): FormState {
  const base = emptyState(settings);
  return {
    ...base,
    amount: (entry.amountPaise / 100).toFixed(2),
    type: entry.type,
    reason: entry.reason,
    accountId: entry.accountId,
    categoryId: entry.categoryId,
    categoryManual: true,
    categoryAuto: false,
    splitEnabled: entry.partyId !== null,
    partyId: entry.partyId,
    splitMethod: "PERCENT",
    splitValue: entry.splitPercent !== null ? String(Number(entry.splitPercent.toFixed(2))) : "100",
    creditsAdded: entry.creditIds.length > 0,
    creditIds: [...entry.creditIds],
  };
}

/**
 * The form after the Reason changes. If you have not chosen the category yourself, a keyword in the Reason picks it;
 * if a keyword picked it earlier and no longer matches, it is cleared again. A category you chose is never touched.
 */
export function withReason(form: FormState, reason: string, keywords: QuickPayOptions["keywords"]): FormState {
  const next = { ...form, reason };
  if (form.categoryManual) return next;
  const matched = matchCategory(reason, keywords);
  if (matched) return { ...next, categoryId: matched, categoryAuto: true };
  if (form.categoryAuto) return { ...next, categoryId: null, categoryAuto: false };
  return next;
}

/** You chose (or cleared) the category: keywords stop changing it for this entry. */
export const withCategory = (form: FormState, categoryId: string | null): FormState => ({ ...form, categoryId, categoryManual: true, categoryAuto: false });

/** Which of the newest `choices` are selected when Credits Added first opens, per Customized Settings. */
export function defaultCreditSelection(choices: readonly RecentCredit[], settings: QuickPaySettingsData["credits"]): string[] {
  const credits = choices.filter((c) => c.type === "CREDIT");
  if (settings.defaultSelection === "latest") return credits.slice(0, 1).map((c) => c.id);
  if (settings.defaultSelection === "custom") return credits.slice(0, settings.customCount).map((c) => c.id);
  return [];
}
