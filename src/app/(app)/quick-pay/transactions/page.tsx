import type { Metadata } from "next";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import {
  addCategoryAction,
  deleteEntryAction,
  getEntryAction,
  getGpayOptionsAction,
  getRecentCreditsAction,
  importGpayAction,
  patchEntryAction,
  setCreditedByAction,
  saveEntryAction,
} from "@/features/quick-pay/actions";
import { addPersonAction } from "@/features/users/actions";
import { getBulkDraftCount } from "@/features/quick-pay/server/bulk-draft";
import { DraftLink } from "@/features/quick-pay/components/draft-link";
import { ExportReportDialog } from "@/features/quick-pay/components/export-report-dialog";
import { ImportDialog } from "@/features/quick-pay/components/import-dialog";
import { ExportMenu } from "@/features/quick-pay/components/export-menu";
import { TransactionsPager } from "@/features/quick-pay/components/transactions-pager";
import { TransactionsTable } from "@/features/quick-pay/components/transactions-table";
import { TransactionsToolbar } from "@/features/quick-pay/components/transactions-toolbar";
import { istDateOf } from "@/features/quick-pay/datetime";
import { effectiveRange, filtersToQuery, hasActiveFilters, parseTxFilters, type TxFilters } from "@/features/quick-pay/filters";
import { listTransactions } from "@/features/quick-pay/server/entries";
import { getQuickPayOptions } from "@/features/quick-pay/server/settings";
import type { QuickPayOptions } from "@/features/quick-pay/types";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Transaction History" };

const KIND_LABEL: Record<string, string> = { DEBIT: "Debit", CREDIT: "Credit", TRANSFER: "Self transfer" };

/** The filters in words, for the Export Report window ("Through: Canara, IDFC"). */
function describeFilters(filters: TxFilters, options: QuickPayOptions): string[] {
  const names = (ids: string[] | undefined, pick: (id: string) => string | undefined) => (ids ?? []).map((id) => pick(id) ?? "").filter(Boolean).join(", ");
  const { from, to } = effectiveRange(filters);
  const lines: string[] = [];
  lines.push(from || to ? `Dates: ${from ?? "…"} to ${to ?? "…"}` : "Dates: all time");
  if (filters.q) lines.push(`Search: ${filters.q}`);
  if (filters.types?.length) lines.push(`Type: ${filters.types.map((t) => KIND_LABEL[t] ?? t).join(", ")}`);
  if (filters.banks?.length) lines.push(`Through: ${names(filters.banks, (id) => options.banks.find((b) => b.id === id)?.label)}`);
  if (filters.categories?.length) lines.push(`Category: ${names(filters.categories, (id) => [...options.categories, ...options.creditCategories].find((c) => c.id === id)?.label)}`);
  if (filters.people?.length) lines.push(`People: ${names(filters.people, (id) => options.persons.find((p) => p.id === id)?.name)}`);
  if (filters.by?.length) lines.push(`Credited by: ${names(filters.by, (id) => options.persons.find((p) => p.id === id)?.name)}`);
  lines.push(`Order: ${filters.order === "asc" ? "old to new" : "new to old"}`);
  return lines;
}

export default async function TransactionHistoryPage({ searchParams }: PageProps<"/quick-pay/transactions">) {
  const user = await requireUser();
  const todayIst = istDateOf(new Date());
  // Opens on the current month unless a period was chosen.
  const filters = parseTxFilters(await searchParams, { defaultMonth: todayIst.slice(0, 7) });

  let result: Awaited<ReturnType<typeof listTransactions>>;
  let options: QuickPayOptions;
  let draftCount = 0;
  let everything = 0;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    [result, options, draftCount, everything] = await Promise.all([
      listTransactions(db, user.id, filters),
      getQuickPayOptions(db, user.id, "gpay"),
      getBulkDraftCount(db, user.id).catch(() => 0),
      db.transaction.count({ where: { userId: user.id, quickPay: true, deletedAt: null } }),
    ]);
  } catch (error) {
    console.error("[quick-pay] could not load transactions", error);
    return (
      <>
        <PageHeader title="Transaction History" />
        <DatabaseUnavailable />
      </>
    );
  }

  const { rows, totals, page, pageCount, typeCounts } = result;
  const query = filtersToQuery(filters);
  const size = filters.size ?? 50;

  return (
    <>
      <PageHeader title="Transaction History" />

      <div className="space-y-4">
        <TransactionsToolbar
          today={todayIst}
          defaultMonth={todayIst.slice(0, 7)}
          options={options}
          total={everything}
          showing={totals.count}
          typeCounts={typeCounts}
          totals={totals}
          slots={{
            draft: <DraftLink iconOnly savedCount={draftCount} />,
            report: <ExportReportDialog query={query} filters={describeFilters(filters, options)} count={totals.count} defaultName={`transaction-history-${todayIst}`} />,
            import: <ImportDialog iconOnly actions={{ getOptions: getGpayOptionsAction, importGpay: importGpayAction }} />,
            export: <ExportMenu iconOnly query={query} />,
          }}
        />

        <TransactionsTable
          rows={rows}
          filtered={hasActiveFilters(filters)}
          options={options}
          actions={{
            patchEntry: patchEntryAction,
            setCreditedBy: setCreditedByAction,
            deleteEntry: deleteEntryAction,
            saveEntry: saveEntryAction,
            getEntry: getEntryAction,
            getRecentCredits: getRecentCreditsAction,
            getOptions: getGpayOptionsAction,
            addCategory: addCategoryAction,
            addPerson: addPersonAction,
          }}
        />

        <TransactionsPager page={page} pageCount={pageCount} size={size} total={totals.count} />
      </div>
    </>
  );
}
