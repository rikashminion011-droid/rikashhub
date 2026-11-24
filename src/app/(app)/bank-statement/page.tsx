import type { Metadata } from "next";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { deleteBankEntryAction, importBankStatementAction, patchBankEntryAction } from "@/features/bank-statement/actions";
import { BankBalancesDialog } from "@/features/bank-statement/components/bank-balances-dialog";
import { BankImportDialog } from "@/features/bank-statement/components/bank-import-dialog";
import { BankStatementTable } from "@/features/bank-statement/components/bank-statement-table";
import { BankStatementToolbar } from "@/features/bank-statement/components/bank-statement-toolbar";
import { reconcileBankStatement } from "@/features/bank-statement/server/sync";
import { countBankStatementRows, getBankBalances, listBankStatement } from "@/features/bank-statement/server/service";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { ExportReportDialog } from "@/features/quick-pay/components/export-report-dialog";
import { TransactionsPager } from "@/features/quick-pay/components/transactions-pager";
import { istDateOf } from "@/features/quick-pay/datetime";
import { effectiveRange, filtersToQuery, hasActiveFilters, parseTxFilters, type TxFilters } from "@/features/quick-pay/filters";
import { getQuickPayOptions } from "@/features/quick-pay/server/settings";
import type { QuickPayOptions } from "@/features/quick-pay/types";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Bank Statement" };

/** The filters in words, for the Export Report window ("Bank: Canara, IDFC"). */
function describeFilters(filters: TxFilters, options: QuickPayOptions): string[] {
  const names = (ids: string[] | undefined, pick: (id: string) => string | undefined) => (ids ?? []).map((id) => pick(id) ?? "").filter(Boolean).join(", ");
  const { from, to } = effectiveRange(filters);
  const lines: string[] = [];
  lines.push(from || to ? `Dates: ${from ?? "…"} to ${to ?? "…"}` : "Dates: all time");
  if (filters.q) lines.push(`Search: ${filters.q}`);
  if (filters.types?.length) lines.push(`Type: ${filters.types.map((t) => (t === "DEBIT" ? "Debit" : t === "CREDIT" ? "Credit" : t)).join(", ")}`);
  if (filters.banks?.length) lines.push(`Bank: ${names(filters.banks, (id) => options.banks.find((b) => b.id === id)?.label)}`);
  if (filters.categories?.length) lines.push(`Category: ${names(filters.categories, (id) => [...options.categories, ...options.creditCategories].find((c) => c.id === id)?.label)}`);
  lines.push(`Order: ${filters.order === "asc" ? "old to new" : "new to old"}`);
  return lines;
}

export default async function BankStatementPage({ searchParams }: PageProps<"/bank-statement">) {
  const user = await requireUser();
  const todayIst = istDateOf(new Date());
  // Opens on the current month unless a period was chosen, like Transaction History.
  const filters = parseTxFilters(await searchParams, { defaultMonth: todayIst.slice(0, 7) });

  let result: Awaited<ReturnType<typeof listBankStatement>>;
  let options: QuickPayOptions;
  let everything = 0;
  let balances: Awaited<ReturnType<typeof getBankBalances>> = [];
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    // Match rows with Transaction History (Reason and Category follow the linked entry). It only changes what is out of step.
    await reconcileBankStatement(db, user.id).catch((error) => console.error("[bank-statement] could not match rows", error));
    [result, options, everything, balances] = await Promise.all([listBankStatement(db, user.id, filters), getQuickPayOptions(db, user.id, "gpay"), countBankStatementRows(db, user.id), getBankBalances(db, user.id)]);
  } catch (error) {
    console.error("[bank-statement] could not load", error);
    return (
      <>
        <PageHeader title="Bank Statement" />
        <DatabaseUnavailable />
      </>
    );
  }

  const { rows, totals, page, pageCount, typeCounts } = result;
  const query = filtersToQuery(filters);
  const size = filters.size ?? 50;

  return (
    <>
      <PageHeader title="Bank Statement" />
      <div className="space-y-4">
        <BankStatementToolbar
          today={todayIst}
          defaultMonth={todayIst.slice(0, 7)}
          options={options}
          total={everything}
          showing={totals.count}
          typeCounts={typeCounts}
          totals={totals}
          slots={{
            balances: <BankBalancesDialog balances={balances} />,
            import: <BankImportDialog banks={options.banks.map((b) => ({ id: b.id, label: b.label }))} importRows={importBankStatementAction} />,
            report: <ExportReportDialog query={query} filters={describeFilters(filters, options)} count={totals.count} defaultName={`bank-statement-${todayIst}`} basePath="/bank-statement/export" />,
          }}
        />
        <BankStatementTable rows={rows} filtered={hasActiveFilters(filters)} options={options} actions={{ patch: patchBankEntryAction, remove: deleteBankEntryAction }} />
        <TransactionsPager page={page} pageCount={pageCount} size={size} total={totals.count} />
      </div>
    </>
  );
}
