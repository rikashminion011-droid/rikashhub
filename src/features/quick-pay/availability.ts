import type { SplitKind } from "./shares";
import type { KeywordEntry } from "./keywords";
import type { BankOption, CategoryOption, PersonOption, QuickPayOptions } from "./types";
import type { EntryType } from "./validation";

/**
 * What Customized Settings lets Quick Entry offer. Banks and people left out there stay in your lists everywhere else, and one
 * that is already chosen on an entry is still shown, so opening an old entry never loses its bank or person.
 */

/** The banks offered in Through dropdowns. `keep` are ids that must stay (the bank already chosen). */
export function visibleBanks(options: Pick<QuickPayOptions, "banks" | "settings">, keep: readonly (string | null)[] = []): BankOption[] {
  const hidden = new Set(options.settings.banks.hiddenIds);
  return options.banks.filter((b) => !hidden.has(b.id) || keep.includes(b.id));
}

/** The people offered for a Split or a Debt. `keep` are people already chosen. */
export function availablePersons(options: Pick<QuickPayOptions, "persons" | "settings">, kind: SplitKind, keep: readonly string[] = []): PersonOption[] {
  const hidden = new Set(kind === "DEBT" ? options.settings.debt.hiddenPersonIds : options.settings.split.hiddenPersonIds);
  return options.persons.filter((p) => !hidden.has(p.id) || keep.includes(p.id));
}

/**
 * One list of categories for both a Debit and a Credit: every category, whichever kind it was first created as (the
 * Debit ones first, in their main and sub order, then the Credit ones). Nothing already saved is lost, and a category
 * can be used on either kind of entry.
 */
export function sharedCategories(debit: readonly CategoryOption[], credit: readonly CategoryOption[]): CategoryOption[] {
  const seen = new Set<string>();
  const names = new Set<string>();
  return [...debit, ...credit].filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    // A Credit category with the same name as a Debit one (OFFICE and Office) is the same choice: it is listed once, the Debit one.
    const name = c.label.trim().toLowerCase();
    if (names.has(name)) return false;
    names.add(name);
    return true;
  });
}

/** The categories offered on an entry. A Debit and a Credit share the same list (see `sharedCategories`). */
export function categoriesFor(options: Pick<QuickPayOptions, "categories" | "creditCategories">, type?: EntryType): CategoryOption[] {
  void type;
  return sharedCategories(options.categories, options.creditCategories);
}

/** The reason keywords that belong to the categories of a Debit, or of a Credit (a word never picks a category of the other kind). */
export function keywordsFor(options: Pick<QuickPayOptions, "categories" | "creditCategories" | "keywords">, type: EntryType): KeywordEntry[] {
  const ids = new Set(categoriesFor(options, type).map((c) => c.id));
  return options.keywords.filter((k) => ids.has(k.categoryId));
}
