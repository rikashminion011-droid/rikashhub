import type { SplitKind } from "./shares";
import type { KeywordEntry } from "./keywords";
import type { BankOption, CategoryOption, PersonOption, QuickPayOptions } from "./types";
import type { EntryType } from "./validation";

/**
 * What Customized Settings lets Quick Entry offer. Banks and people left out there stay in your lists everywhere else, and one
 * that is already chosen on an entry is still shown, so opening an old entry never loses its bank or person.
 */

/** The banks offered in Bank Through dropdowns. `keep` are ids that must stay (the bank already chosen). */
export function visibleBanks(options: Pick<QuickPayOptions, "banks" | "settings">, keep: readonly (string | null)[] = []): BankOption[] {
  const hidden = new Set(options.settings.banks.hiddenIds);
  return options.banks.filter((b) => !hidden.has(b.id) || keep.includes(b.id));
}

/** The people offered for a Split or a Debt. `keep` are people already chosen. */
export function availablePersons(options: Pick<QuickPayOptions, "persons" | "settings">, kind: SplitKind, keep: readonly string[] = []): PersonOption[] {
  const hidden = new Set(kind === "DEBT" ? options.settings.debt.hiddenPersonIds : options.settings.split.hiddenPersonIds);
  return options.persons.filter((p) => !hidden.has(p.id) || keep.includes(p.id));
}

/** A Debit and a Credit have separate category lists. */
export function categoriesFor(options: Pick<QuickPayOptions, "categories" | "creditCategories">, type: EntryType): CategoryOption[] {
  return type === "CREDIT" ? options.creditCategories : options.categories;
}

/** The reason keywords that belong to the categories of a Debit, or of a Credit (a word never picks a category of the other kind). */
export function keywordsFor(options: Pick<QuickPayOptions, "categories" | "creditCategories" | "keywords">, type: EntryType): KeywordEntry[] {
  const ids = new Set(categoriesFor(options, type).map((c) => c.id));
  return options.keywords.filter((k) => ids.has(k.categoryId));
}
