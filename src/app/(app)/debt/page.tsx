import type { Metadata } from "next";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { addPaymentAction, deletePaymentAction, getDebtHistoryAction } from "@/features/debt/actions";
import { DebtTable } from "@/features/debt/components/debt-table";
import { getDebtSummary } from "@/features/debt/server/service";
import type { DebtSummary } from "@/features/debt/types";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Debt Management" };

export default async function DebtPage() {
  const user = await requireUser();

  let summary: DebtSummary;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    summary = await getDebtSummary(db, user.id);
  } catch (error) {
    console.error("[debt] could not load", error);
    return (
      <>
        <PageHeader title="Debt Management" />
        <DatabaseUnavailable />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Debt Management"
        description="What each person owes from splits, what they have paid, and what remains. It updates by itself whenever a split is added, changed or removed."
        actions={
          <Link href="/quick-pay/settings?tab=users" className={cn(buttonVariants({ variant: "outline" }))}>
            <Settings2 /> <span className="hidden sm:inline">Manage users</span>
          </Link>
        }
      />
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="gap-1 py-4">
            <CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground">Total split</p>
              <p className="text-2xl font-semibold tabular-nums">{formatINR(summary.totalSplitPaise)}</p>
            </CardContent>
          </Card>
          <Card className="gap-1 py-4">
            <CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground">Total paid</p>
              <p className="text-2xl font-semibold text-success tabular-nums">{formatINR(summary.totalPaidPaise)}</p>
            </CardContent>
          </Card>
          <Card className="gap-1 py-4">
            <CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground">Total remaining</p>
              <p className={cn("text-2xl font-semibold tabular-nums", summary.totalRemainingPaise > 0 && "text-destructive")}>{formatINR(summary.totalRemainingPaise)}</p>
            </CardContent>
          </Card>
        </div>
        <DebtTable summary={summary} actions={{ getHistory: getDebtHistoryAction, addPayment: addPaymentAction, deletePayment: deletePaymentAction }} />
      </div>
    </>
  );
}
