import { matchCategory } from "./keywords";
import type { QuickPaySettingsData } from "./settings-model";
import { evenPercents, singlePercent, type SplitKind } from "./shares";
import type { SplitMethod } from "./split";
import type { EntryDetails, QuickPayOptions, RecentCredit } from "./types";
import type { EntryType, QuickPayInput } from "./validation";

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
  /** Split or Debt when the entry is shared with people; null when it is not. Only one of the two can be on. */
  splitKind: SplitKind | null;
  /** The chosen people with their shares, in the order chosen. */
  shares: FormShare[];
  creditsAdded: boolean;
  creditIds: string[];
}

/** One chosen person. `edited` is true once you typed their share yourself, so choosing more people never changes it. */
export interface FormShare {
  partyId: string;
  method: SplitMethod;
  /** A percentage ("50") or, for FIXED, an amount ("25"). */
  value: string;
  edited: boolean;
}

const rupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

/** A new, empty form, with the defaults chosen in Customized Settings. */
export function emptyState(settings: QuickPaySettingsData, options?: Pick<QuickPayOptions, "banks" | "categories" | "persons">): FormState {
  const { fields, split } = settings;
  // A default that has since been removed is ignored instead of leaving a dead selection.
  const bank = options && fields.defaults.bankId && !options.banks.some((b) => b.id === fields.defaults.bankId) ? null : fields.defaults.bankId;
  // The default category is a Debit category, so it is only used when the form opens as a Debit.
  const category = fields.defaults.type !== "DEBIT" || (options && fields.defaults.categoryId && !options.categories.some((c) => c.id === fields.defaults.categoryId)) ? null : fields.defaults.categoryId;
  const party = options && split.defaultPartyId && !options.persons.some((p) => p.id === split.defaultPartyId) ? null : split.defaultPartyId;
  return {
    amount: "",
    type: fields.defaults.type,
    reason: "",
    accountId: bank,
    categoryId: category,
    categoryManual: false,
    categoryAuto: false,
    splitKind: split.enabledByDefault ? "SPLIT" : null,
    shares:
      split.enabledByDefault && party
        ? [
            split.method === "PERCENT"
              ? { partyId: party, method: "PERCENT", value: String(split.defaultPercent), edited: false }
              : { partyId: party, method: "FIXED", value: split.defaultFixedPaise > 0 ? rupees(split.defaultFixedPaise) : "", edited: true },
          ]
        : [],
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
    splitKind: entry.splitKind,
    // What was saved is kept as it is: opening an entry to edit it never re-divides anyone's share.
    shares: entry.shares.map((x) => ({ partyId: x.partyId, method: "PERCENT" as const, value: String(Number(x.percent.toFixed(2))), edited: true })),
    creditsAdded: entry.creditIds.length > 0,
    creditIds: [...entry.creditIds],
  };
}

/**
 * The form after the Reason changes. `keywords` are the ones for this kind of entry (see keywordsFor). If you have not chosen the category yourself, a keyword in the Reason picks it;
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

/** The item after `current` in `ids`, wrapping to the first after the last (or the first when nothing is chosen yet). */
export function cycleId(ids: readonly string[], current: string | null): string | null {
  if (ids.length === 0) return null;
  const at = current === null ? -1 : ids.indexOf(current);
  return ids[(at + 1) % ids.length]!;
}

/** Which credit is chosen when Credit History first opens, per Customized Settings. Only one credit can be chosen. */
export function defaultCreditSelection(choices: readonly RecentCredit[], settings: QuickPaySettingsData["credits"]): string[] {
  const credits = choices.filter((c) => c.type === "CREDIT");
  if (settings.defaultSelection === "latest" || settings.defaultSelection === "custom") return credits.slice(0, 1).map((c) => c.id);
  return [];
}

/**
 * The people chosen for a Split or Debt. A person's share you have not typed yourself is worked out again whenever the
 * group changes: one person gets the default percentage (50% for a Split, 100% for a Debt, both set in Customized Settings),
 * several divide the amount equally. Shares you typed stay as they are.
 */
export function withPeople(form: FormState, ids: readonly string[], settings: QuickPaySettingsData): FormState {
  if (!form.splitKind) return form;
  return { ...form, shares: peopleShares(form.shares, ids, form.splitKind, settings) };
}

/** The shares for a chosen group of people (see withPeople). Also used by the Add Bulk sheet, one row at a time. */
export function peopleShares(current: readonly FormShare[], ids: readonly string[], kind: SplitKind, settings: QuickPaySettingsData): FormShare[] {
  const existing = new Map(current.map((s) => [s.partyId, s]));
  const people = ids.map((id) => existing.get(id) ?? ({ partyId: id, method: "PERCENT", value: "", edited: false } satisfies FormShare));
  const single = singlePercent(kind, settings.split.defaultPercent, settings.debt.defaultPercent);
  // Several people share equally (50% each for two); with "equal" turned off each one starts at the default percentage.
  const autos = settings.split.equalDivide || people.length === 1 ? evenPercents(people.length, single) : people.map(() => single);
  return people.map((p, i) => (p.edited ? p : { ...p, method: "PERCENT" as const, value: String(autos[i]) }));
}

/** A person's share typed by hand, on a list of shares. */
export const shareValueOf = (shares: readonly FormShare[], partyId: string, method: SplitMethod, value: string): FormShare[] =>
  shares.map((s) => (s.partyId === partyId ? { ...s, method, value, edited: true } : s));

/** Switches between Split and Debt (or off), keeping the chosen people and working their shares out again. */
export function withKind(form: FormState, kind: SplitKind | null, settings: QuickPaySettingsData, defaultPartyId: string | null): FormState {
  if (kind === null) return { ...form, splitKind: null, shares: [] };
  const ids = form.shares.length > 0 ? form.shares.map((s) => s.partyId) : defaultPartyId ? [defaultPartyId] : [];
  // The shares are re-divided for the new kind, so a Debt starts at 100% where a Split starts at 50%.
  return withPeople({ ...form, splitKind: kind, shares: form.shares.map((s) => ({ ...s, edited: false })) }, ids, settings);
}

/** You typed one person's share (a percentage or an amount). */
export function withShareValue(form: FormState, partyId: string, method: SplitMethod, value: string): FormState {
  return { ...form, shares: form.shares.map((s) => (s.partyId === partyId ? { ...s, method, value, edited: true } : s)) };
}

/** What the form sends to be validated and saved. A Credit carries a Credit category but never a Debt or Credits Added. */
export function toQuickPayInput(form: FormState): QuickPayInput {
  const debit = form.type === "DEBIT";
  return {
    amount: form.amount,
    type: form.type,
    reason: form.reason,
    accountId: form.accountId,
    categoryId: form.categoryId,
    split: {
      enabled: form.splitKind !== null && (debit || form.splitKind === "SPLIT"),
      kind: form.splitKind ?? "SPLIT",
      shares: form.shares.map(({ partyId, method, value }) => ({ partyId, method, value })),
    },
    creditIds: debit ? form.creditIds : [],
  };
}
