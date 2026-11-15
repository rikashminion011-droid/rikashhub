import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { listForRecipient, listPortals } from "@/features/credit-portal/server/service";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { formatClock, formatLongDate } from "@/features/quick-pay/date-format";
import { istDateOf, istTimeOf } from "@/features/quick-pay/datetime";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Credit Portal · Recipient" };

const when = (iso: string) => {
  const d = new Date(iso);
  return `${formatLongDate(istDateOf(d))}, ${formatClock(istTimeOf(d))}`;
};

/** Everything on one portal for one person: their statement lines, and their unbilled transactions not yet on a statement. */
export default async function RecipientPage({ params, searchParams }: PageProps<"/credit-portal/recipient/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();

  let data;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    const person = await db.expenseParty.findFirst({ where: { id, userId: user.id } });
    if (!person) notFound();
    const portals = await listPortals(db, user.id);
    const wanted = Array.isArray(query.portal) ? query.portal[0] : query.portal;
    const portal = portals.find((p) => p.id === wanted) ?? portals[0];
    if (!portal) notFound();
    const { statement, unbilled } = await listForRecipient(db, user.id, portal.id, id, { from: null, to: null });
    data = { person, portal, statement, unbilled };
  } catch (error) {
    if (error instanceof Error && String((error as { digest?: unknown }).digest ?? "").startsWith("NEXT_")) throw error;
    console.error("[credit-portal] recipient could not load", error);
    return (
      <>
        <PageHeader title="Credit Portal" />
        <DatabaseUnavailable />
      </>
    );
  }

  const { person, portal, statement, unbilled } = data;
  const debit = statement.reduce((s, r) => s + r.debitPaise, 0) + unbilled.filter((r) => r.kind === "DEBIT").reduce((s, r) => s + r.amountPaise, 0);
  const credit = statement.reduce((s, r) => s + r.creditPaise, 0) + unbilled.filter((r) => r.kind === "CREDIT").reduce((s, r) => s + r.amountPaise, 0);

  return (
    <>
      <PageHeader
        title={person.name}
        description={`${portal.name}: statement lines and unbilled transactions for this person.`}
        actions={
          <Link href={`/credit-portal?portal=${portal.id}&tab=statement`} className={cn(buttonVariants({ variant: "outline" }))}>
            <ChevronLeft /> Back
          </Link>
        }
      />
      <div className="space-y-6">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            <span className="text-muted-foreground">Debit </span>
            <span className="font-semibold text-red-600 tabular-nums">{formatINR(debit)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Credit </span>
            <span className="font-semibold text-green-600 tabular-nums">{formatINR(credit)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Net </span>
            <span className="font-semibold tabular-nums">{formatINR(debit - credit)}</span>
          </span>
        </div>

        <section className="space-y-2" aria-labelledby="stmt">
          <h2 id="stmt" className="text-sm font-semibold">Statement ({statement.length})</h2>
          {statement.length === 0 ? (
            <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">No statement lines for this person.</p>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {statement.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{r.reason || r.details}</p>
                    <p className="text-xs text-muted-foreground">{when(r.occurredAt)}</p>
                  </div>
                  <p className={cn("shrink-0 font-semibold tabular-nums", r.creditPaise > 0 ? "text-green-600" : "text-red-600")}>
                    {r.creditPaise > 0 ? "+" : "−"}
                    {formatINR(r.creditPaise > 0 ? r.creditPaise : r.debitPaise)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2" aria-labelledby="unb">
          <h2 id="unb" className="text-sm font-semibold">Unbilled ({unbilled.length})</h2>
          {unbilled.length === 0 ? (
            <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">No unbilled transactions for this person.</p>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {unbilled.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{r.reason || r.details || "Transaction"}</p>
                    <p className="text-xs text-muted-foreground">{when(r.occurredAt)}</p>
                  </div>
                  <p className={cn("shrink-0 font-semibold tabular-nums", r.kind === "CREDIT" ? "text-green-600" : "text-red-600")}>
                    {r.kind === "CREDIT" ? "+" : "−"}
                    {formatINR(r.amountPaise)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
