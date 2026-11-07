import type { Metadata } from "next";
import { DatabaseZap } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  addAccountAction,
  addCategoryAction,
  addPartyAction,
  addPaymentMethodAction,
  archiveOptionAction,
  createExpenseAction,
} from "@/features/expenses/actions";
import { ExpenseEntryForm } from "@/features/expenses/components/expense-entry-form";
import { RecentExpenses } from "@/features/expenses/components/recent-expenses";
import { getRecentExpenses } from "@/features/expenses/server/queries";
import { ensureUserSetup, getExpenseFormData } from "@/features/expenses/server/service";
import type { ExpenseFormData, RecentExpense } from "@/features/expenses/types";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { toISODate, todayIn } from "@/lib/finance";

export const metadata: Metadata = { title: "Quick Entry" };

export default async function QuickEntryPage() {
  const user = await requireUser();

  let data: ExpenseFormData;
  let recent: RecentExpense[];
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    [data, recent] = await Promise.all([getExpenseFormData(db, user.id), getRecentExpenses(db, user.id)]);
  } catch (error) {
    console.error("[quick-entry] could not load from the database", error);
    return (
      <>
        <PageHeader title="Quick Entry" description="Record an expense in seconds." />
        <Card className="max-w-xl">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                <DatabaseZap className="size-4" aria-hidden />
              </span>
              <CardTitle>Can&apos;t reach the database</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Nothing you enter here would be saved right now, so the form is hidden.</p>
            <p>
              Check that <code className="rounded bg-muted px-1 py-0.5 text-xs">DATABASE_URL</code> in{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">.env.local</code> is correct and that the database
              certificate is set up, then reload this page.
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Quick Entry" description="Record an expense in seconds." />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ExpenseEntryForm
          initialData={data}
          today={toISODate(todayIn())}
          actions={{
            createExpense: createExpenseAction,
            addPaymentMethod: addPaymentMethodAction,
            addAccount: addAccountAction,
            addParty: addPartyAction,
            addCategory: addCategoryAction,
            archiveOption: archiveOptionAction,
          }}
        />
        <div className="lg:sticky lg:top-20">
          <RecentExpenses items={recent} />
        </div>
      </div>
    </>
  );
}
