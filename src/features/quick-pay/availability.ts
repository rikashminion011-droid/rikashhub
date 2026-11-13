import type { SplitKind } from "./shares";
import type { BankOption, PersonOption, QuickPayOptions } from "./types";

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
