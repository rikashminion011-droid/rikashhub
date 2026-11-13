"use client";

import { createContext, useContext } from "react";
import { periodFor, type Period } from "../period";

/** Sent whenever something is saved, edited or deleted, so the totals at the top and the Transactions list read themselves again. */
export const DATA_CHANGED_EVENT = "quickpay:data-changed";
export const notifyDataChanged = () => window.dispatchEvent(new Event(DATA_CHANGED_EVENT));

/** The period chosen in the header above the tabs; the Transactions list shows the same one. */
export const PeriodContext = createContext<{ period: Period; today: string } | null>(null);

export function usePeriod(fallbackToday: string): { period: Period; today: string } {
  return useContext(PeriodContext) ?? { period: periodFor("day", fallbackToday), today: fallbackToday };
}
