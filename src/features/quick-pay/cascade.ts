import type { BankOption, CategoryOption } from "./types";

/**
 * Main name and sub name, like a cascading menu: GPay > HDFC, IDFC, DBS.
 * A group is a main name; its children are the sub names. A group with a `value` can also be chosen itself.
 */
export interface CascadeChild {
  value: string;
  /** Full label, e.g. "GPay → HDFC". */
  label: string;
  /** Sub name only, e.g. "HDFC". */
  name: string;
}

export interface CascadeGroup {
  name: string;
  /** Set when the main name itself can be chosen (a bank with no accounts, or any main category). */
  value: string | null;
  children: CascadeChild[];
}

/** Banks: a main file with accounts is only a heading; one without is chosen directly. */
export function groupBanks(banks: readonly BankOption[]): CascadeGroup[] {
  const groups: CascadeGroup[] = [];
  for (const bank of banks) {
    const standalone = bank.label === bank.mainName;
    let group = groups.find((g) => g.name === bank.mainName);
    if (!group) {
      group = { name: bank.mainName, value: null, children: [] };
      groups.push(group);
    }
    if (standalone) group.value = bank.id;
    else group.children.push({ value: bank.id, label: bank.label, name: bank.name });
  }
  return groups;
}

/** Categories: every main category can be chosen, and its sub-categories open beside it. */
export function groupCategories(categories: readonly CategoryOption[]): CascadeGroup[] {
  const groups: CascadeGroup[] = [];
  for (const category of categories.filter((c) => !c.isSub)) {
    groups.push({ name: category.name, value: category.id, children: [] });
  }
  for (const sub of categories.filter((c) => c.isSub)) {
    groups.find((g) => g.name === sub.mainName)?.children.push({ value: sub.id, label: sub.label, name: sub.name });
  }
  return groups;
}

/** Every choosable item as one flat list (what search looks through). */
export function flattenGroups(groups: readonly CascadeGroup[]): { value: string; label: string }[] {
  return groups.flatMap((g) => [...(g.value ? [{ value: g.value, label: g.name }] : []), ...g.children.map((c) => ({ value: c.value, label: c.label }))]);
}
