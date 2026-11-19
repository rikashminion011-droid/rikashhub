"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The options used most recently in Quick Entry (Category, Through), kept in this browser, newest first. They are offered as
 * one-tap chips under the dropdowns. Storage can be blocked or empty: everything then simply shows no chips.
 */

const PREFIX = "rikash.recent.";
const EVENT = "rikash-recent-choices";
const LIMIT = 4;
const EMPTY = "[]";

function read(field: string): string {
  try {
    return window.localStorage.getItem(PREFIX + field) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Remembers that `value` was just used for `field`: it goes first, and only the latest few are kept. */
export function rememberChoice(field: string, value: string | null | undefined): void {
  if (!value) return;
  try {
    const current = JSON.parse(read(field)) as string[];
    const next = [value, ...current.filter((v) => v !== value)].slice(0, LIMIT * 3);
    window.localStorage.setItem(PREFIX + field, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* storage is not available */
  }
}

/** The values recently used for `field`, newest first. */
export function useRecentChoices(field: string): string[] {
  const snapshot = useSyncExternalStore(
    subscribe,
    useCallback(() => read(field), [field]),
    () => EMPTY,
  );
  try {
    const list = JSON.parse(snapshot) as unknown;
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
