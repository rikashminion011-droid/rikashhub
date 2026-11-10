import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import {
  deleteEntryAction,
  getEntryAction,
  getEntryIdsAction,
  getOptionsAction,
  getRecentCreditsAction,
  saveEntryAction,
} from "@/features/quick-pay/actions";
import { QuickEntryForm } from "@/features/quick-pay/components/quick-entry-form";
import { getEntry } from "@/features/quick-pay/server/entries";
import { getQuickPayOptions } from "@/features/quick-pay/server/settings";
import type { EntryDetails, QuickPayOptions } from "@/features/quick-pay/types";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Quick Entry" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function QuickPayPage({ searchParams }: PageProps<"/quick-pay">) {
  const user = await requireUser();
  const params = await searchParams;
  const entryId = typeof params.entry === "string" && UUID.test(params.entry) ? params.entry : null;

  let options: QuickPayOptions;
  let entry: EntryDetails | null = null;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    options = await getQuickPayOptions(db, user.id);
    if (entryId) entry = await getEntry(db, user.id, entryId);
  } catch (error) {
    console.error("[quick-pay] could not load from the database", error);
    return (
      <>
        <PageHeader title="Quick Entry" description="Record a credit or debit in seconds." />
        <DatabaseUnavailable />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Quick Entry" description="Record a credit or debit. Entries show up in GPay Transactions straight away." />
      <div className="max-w-2xl">
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
          }}
        />
      </div>
    </>
  );
}
