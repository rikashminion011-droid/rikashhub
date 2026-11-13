import type { Metadata } from "next";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { ensureUserSetup } from "@/features/expenses/server/service";
import {
  addCategoryAction,
  deleteEntryAction,
  getEntryAction,
  getOptionsAction,
  getPeriodTotalsAction,
  getRecentCreditsAction,
  listPeriodAction,
  saveEntryAction,
  saveTransferAction,
} from "@/features/quick-pay/actions";
import { getFoodPricingAction, getFoodTotalAction, saveFoodEntryAction } from "@/features/food/actions";
import { EntryModeSwitch } from "@/features/food/components/entry-mode-switch";
import { QuickEntryForm } from "@/features/quick-pay/components/quick-entry-form";
import { TransactionsPanel } from "@/features/quick-pay/components/transactions-panel";
import { TransferForm } from "@/features/quick-pay/components/transfer-form";
import { istDateOf } from "@/features/quick-pay/datetime";
import { getEntry } from "@/features/quick-pay/server/entries";
import { getQuickPayOptions } from "@/features/quick-pay/server/settings";
import type { EntryDetails, QuickPayOptions } from "@/features/quick-pay/types";
import { addPersonAction } from "@/features/users/actions";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Quick Entry" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function QuickPayPage({ searchParams }: PageProps<"/quick-pay">) {
  const user = await requireUser();
  const params = await searchParams;
  const entryId = typeof params.entry === "string" && UUID.test(params.entry) ? params.entry : null;
  const today = istDateOf(new Date());

  let options: QuickPayOptions;
  let entry: EntryDetails | null = null;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    [options, entry] = await Promise.all([getQuickPayOptions(db, user.id), entryId ? getEntry(db, user.id, entryId) : Promise.resolve(null)]);
  } catch (error) {
    console.error("[quick-pay] could not load from the database", error);
    return <DatabaseUnavailable />;
  }

  const adders = { addCategory: addCategoryAction, addPerson: addPersonAction };

  return (
    <EntryModeSwitch
      today={today}
      getTotals={getPeriodTotalsAction}
      foodActions={{ getPricing: getFoodPricingAction, saveEntry: saveFoodEntryAction, getTotal: getFoodTotalAction }}
      transactions={
        <TransactionsPanel
          today={today}
          options={options}
          actions={{
            listPeriod: listPeriodAction,
            deleteEntry: deleteEntryAction,
            saveEntry: saveEntryAction,
            getEntry: getEntryAction,
            getRecentCredits: getRecentCreditsAction,
            getOptions: getOptionsAction,
            ...adders,
          }}
        />
      }
      payment={
        <QuickEntryForm
          // A different entry means a fresh form (keeps the switcher and the fields in step with the URL).
          key={entry?.id ?? "new"}
          initialOptions={options}
          initialEntry={entry}
          actions={{ saveEntry: saveEntryAction, deleteEntry: deleteEntryAction, getEntry: getEntryAction, getRecentCredits: getRecentCreditsAction, getOptions: getOptionsAction, ...adders }}
        />
      }
      transfer={<TransferForm options={options} saveTransfer={saveTransferAction} />}
    />
  );
}
