"use client";

import { useMemo } from "react";
import type { QuickAddActions, QuickPayActions } from "../actions";
import { categoriesFor } from "../availability";
import type { QuickPayOptions } from "../types";
import type { EntryType } from "../validation";
import type { AddResult } from "./inline-add";

export type QuickAddHostActions = QuickAddActions & Pick<QuickPayActions, "getOptions">;

/**
 * Adding a category or a person from inside the entry form. The new one is saved, the lists are reloaded so it shows up,
 * and its id is handed back so the form can select it. Nothing the user has typed is lost, because the page never changes.
 */
export function useQuickAdd(actions: QuickAddHostActions, setOptions: (options: QuickPayOptions) => void) {
  return useMemo(() => {
    async function reload(): Promise<QuickPayOptions | null> {
      const result = await actions.getOptions();
      if (!result.ok) return null;
      setOptions(result.options);
      return result.options;
    }

    /** Adds a category to the Debit list or the Credit list, whichever kind of entry it is for. */
    async function addCategory(name: string, type: EntryType = "DEBIT"): Promise<AddResult> {
      const added = await actions.addCategory({ name, kind: type });
      if (!added.ok) return { ok: false, error: added.error };
      const options = await reload();
      const key = name.trim().toLowerCase();
      const found = (options ? categoriesFor(options, type) : []).find((c) => !c.isSub && c.name.toLowerCase() === key);
      return found ? { ok: true, id: found.id } : { ok: false, error: "Added, but it could not be selected. Pick it from the list." };
    }

    async function addPerson(name: string): Promise<AddResult> {
      const added = await actions.addPerson({ name });
      if (!added.ok) return { ok: false, error: added.error };
      const options = await reload();
      const key = name.trim().toLowerCase();
      const id = added.createdId ?? options?.persons.find((p) => p.name.toLowerCase() === key)?.id;
      return id ? { ok: true, id } : { ok: false, error: "Added, but it could not be selected. Pick it from the list." };
    }

    /** Puts a reason under a category (an existing one, or a new one typed here). Returns an error message, or null when it worked. */
    async function assignReason(reason: string, type: EntryType, input: { categoryId: string | null; newCategory?: string }): Promise<{ ok: true; categoryId: string } | { ok: false; error: string }> {
      if (!actions.assignReason) return { ok: false, error: "This is not available here." };
      const done = await actions.assignReason({ reason, kind: type, ...input });
      if (!done.ok) return { ok: false, error: done.error };
      await reload();
      return { ok: true, categoryId: done.categoryId };
    }

    return { addCategory, addPerson, assignReason: actions.assignReason ? assignReason : undefined };
  }, [actions, setOptions]);
}
