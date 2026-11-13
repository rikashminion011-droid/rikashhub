import type { Metadata } from "next";
import { Zap } from "lucide-react";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import {
  addCategoryAction,
  deleteEntryAction,
  getDayTotalsAction,
  getEntryAction,
  getEntryIdsAction,
  getOptionsAction,
  getRecentCreditsAction,
  saveEntryAction,
} from "@/features/quick-pay/actions";
import { addPersonAction } from "@/features/users/actions";
import { getFoodPricingAction, saveFoodEntryAction } from "@/features/food/actions";
import { EntryModeSwitch } from "@/features/food/components/entry-mode-switch";
import { QuickEntryForm } from "@/features/quick-pay/components/quick-entry-form";
import { DaySummary } from "@/features/quick-pay/components/day-summary";
import { RecentEntries } from "@/features/quick-pay/components/quick-side-panels";
import { istDateOf } from "@/features/quick-pay/datetime";
import { getEntry, listTransactions } from "@/features/quick-pay/server/entries";
import { getQuickPayOptions } from "@/features/quick-pay/server/settings";
import type { EntryDetails, QuickPayOptions, TxRow, TxTotals } from "@/features/quick-pay/types";
import { parseTxFilters } from "@/features/quick-pay/filters";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Quick Entry" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function QuickPayPage({ searchParams }: PageProps<"/quick-pay">) {
  const user = await requireUser();
  const params = await searchParams;
  const entryId = typeof params.entry === "string" && UUID.test(params.entry) ? params.entry : null;
  const now = new Date();
  const today = istDateOf(now);

  let options: QuickPayOptions;
  let entry: EntryDetails | null = null;
  let todayTotals: TxTotals;
  let recent: TxRow[];
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    const [loadedOptions, todayResult, recentResult, loadedEntry] = await Promise.all([
      getQuickPayOptions(db, user.id),
      listTransactions(db, user.id, parseTxFilters({ from: today, to: today }), { pageSize: 1 }),
      listTransactions(db, user.id, parseTxFilters({}), { pageSize: 5 }),
      entryId ? getEntry(db, user.id, entryId) : Promise.resolve(null),
    ]);
    options = loadedOptions;
    todayTotals = todayResult.totals;
    recent = recentResult.rows;
    entry = loadedEntry;
  } catch (error) {
    console.error("[quick-pay] could not load from the database", error);
    return <DatabaseUnavailable />;
  }

  return (
    <>
      <div className="mb-6 flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
          <Zap className="size-7 fill-current" aria-hidden />
        </span>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quick Entry</h1>
          <p className="text-sm text-muted-foreground">Record a payment or a meal. Payments show up in GPay Transactions and meals in Monthly Food Tracking straight away.</p>
        </div>
      </div>

      <EntryModeSwitch
        foodActions={{ getPricing: getFoodPricingAction, saveEntry: saveFoodEntryAction }}
        payment={
          <QuickEntryForm
            // A different entry means a fresh form (keeps the switcher and the fields in step with the URL).
            key={entry?.id ?? "new"}
            initialOptions={options}
            initialEntry={entry}
            actions={{
              saveEntry: saveEntryAction,
              deleteEntry: deleteEntryAction,
              getEntry: getEntryAction,
              getEntryIds: getEntryIdsAction,
              getRecentCredits: getRecentCreditsAction,
              getOptions: getOptionsAction,
              addCategory: addCategoryAction,
              addPerson: addPersonAction,
            }}
          />
        }
        sidePanels={
          <>
            <DaySummary today={today} todayTotals={todayTotals} getDayTotals={getDayTotalsAction} />
            <RecentEntries rows={recent} />
          </>
        }
      />
    </>
  );
}
