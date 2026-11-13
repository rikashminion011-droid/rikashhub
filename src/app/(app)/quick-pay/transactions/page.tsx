import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, FilePlus2 } from "lucide-react";
import Link from "next/link";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  addCategoryAction,
  deleteEntryAction,
  getBalancesAction,
  getEntryAction,
  getOptionsAction,
  getRecentCreditsAction,
  importGpayAction,
  patchEntryAction,
  saveEntryAction,
  setOpeningBalanceAction,
} from "@/features/quick-pay/actions";
import { addPersonAction } from "@/features/users/actions";
import { getBulkDraftCount } from "@/features/quick-pay/server/bulk-draft";
import { DraftLink } from "@/features/quick-pay/components/draft-link";
import { BalancesDialog } from "@/features/quick-pay/components/balances-dialog";
import { ImportDialog } from "@/features/quick-pay/components/import-dialog";
import { ExportMenu } from "@/features/quick-pay/components/export-menu";
import { TransactionsFilterBar } from "@/features/quick-pay/components/transactions-filter-bar";
import { TransactionsTable } from "@/features/quick-pay/components/transactions-table";
import { istDateOf } from "@/features/quick-pay/datetime";
import { PAGE_SIZE, effectiveRange, filtersToQuery, hasActiveFilters, parseTxFilters } from "@/features/quick-pay/filters";
import { listTransactions } from "@/features/quick-pay/server/entries";
import { getQuickPayOptions } from "@/features/quick-pay/server/settings";
import type { QuickPayOptions } from "@/features/quick-pay/types";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "GPay Transactions" };

export default async function TransactionsPage({ searchParams }: PageProps<"/quick-pay/transactions">) {
  const user = await requireUser();
  const todayIst = istDateOf(new Date());
  // Opens on the current month unless a period was chosen.
  const filters = parseTxFilters(await searchParams, { defaultMonth: todayIst.slice(0, 7) });

  let result: Awaited<ReturnType<typeof listTransactions>>;
  let options: QuickPayOptions;
  let draftCount = 0;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    [result, options, draftCount] = await Promise.all([listTransactions(db, user.id, filters), getQuickPayOptions(db, user.id), getBulkDraftCount(db, user.id).catch(() => 0)]);
  } catch (error) {
    console.error("[quick-pay] could not load transactions", error);
    return (
      <>
        <PageHeader title="GPay Transactions" />
        <DatabaseUnavailable />
      </>
    );
  }

  const { rows, totals, page, pageCount } = result;
  const query = filtersToQuery(filters);
  const pageHref = (p: number) => {
    const q = filtersToQuery({ ...filters, page: p }, { page: true });
    return q ? `/quick-pay/transactions?${q}` : "/quick-pay/transactions";
  };
  const range = effectiveRange(filters);
  const first = totals.count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, totals.count);

  return (
    <>
      <PageHeader
        title="GPay Transactions"
        description="Every Quick Pay entry, newest first."
        actions={
          <>
            <Link href="/quick-pay/transactions/bulk" className={cn(buttonVariants({ variant: "outline" }))}>
              <FilePlus2 /> Add Bulk
            </Link>
            <DraftLink savedCount={draftCount} />
            <ImportDialog actions={{ getOptions: getOptionsAction, importGpay: importGpayAction }} />
            <ExportMenu query={query} />
          </>
        }
      />

      <div className="space-y-5">
        <TransactionsFilterBar today={todayIst} defaultMonth={todayIst.slice(0, 7)} options={options} />

        {/* Summary for the selected period */}
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Card className="gap-1 py-4">
            <CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground">Total Debit</p>
              <p className="text-2xl font-semibold text-destructive tabular-nums">{formatINR(totals.debitPaise)}</p>
            </CardContent>
          </Card>
          <Card className="gap-1 py-4">
            <CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground">Total Credit</p>
              <p className="text-2xl font-semibold text-success tabular-nums">{formatINR(totals.creditPaise)}</p>
            </CardContent>
          </Card>
          <div className="flex items-center">
            <BalancesDialog actions={{ getBalances: getBalancesAction, setOpeningBalance: setOpeningBalanceAction }} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {range.from || range.to ? "Showing the selected period." : "Showing all time."} {totals.count} transaction{totals.count === 1 ? "" : "s"}
          {filters.q ? ` matching “${filters.q}”` : ""}.
        </p>

        <TransactionsTable
          rows={rows}
          filtered={hasActiveFilters(filters)}
          options={options}
          actions={{
            patchEntry: patchEntryAction,
            deleteEntry: deleteEntryAction,
            saveEntry: saveEntryAction,
            getEntry: getEntryAction,
            getRecentCredits: getRecentCreditsAction,
            getOptions: getOptionsAction,
            addCategory: addCategoryAction,
            addPerson: addPersonAction,
          }}
        />

        {pageCount > 1 ? (
          <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground tabular-nums">
              {first}–{last} of {totals.count}
            </p>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                  <ChevronLeft /> Previous
                </Link>
              ) : null}
              <span className="text-muted-foreground tabular-nums">
                Page {page} of {pageCount}
              </span>
              {page < pageCount ? (
                <Link href={pageHref(page + 1)} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                  Next <ChevronRight />
                </Link>
              ) : null}
            </div>
          </nav>
        ) : null}
      </div>
    </>
  );
}
