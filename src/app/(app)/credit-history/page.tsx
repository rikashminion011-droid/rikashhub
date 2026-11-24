import type { Metadata } from "next";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { setDefaultCreditAction } from "@/features/credit-history/actions";
import { CreditHistoryView } from "@/features/credit-history/components/credit-history-view";
import { getCreditDebits, listCreditSources, type CreditDebit, type CreditSource, type CreditSummary } from "@/features/credit-history/server/service";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Credit History" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CreditHistoryPage({ searchParams }: PageProps<"/credit-history">) {
  const user = await requireUser();
  const params = await searchParams;
  const c = typeof params.c === "string" && UUID.test(params.c) ? params.c : null;

  let sources: CreditSource[];
  let summary: CreditSummary;
  let debits: CreditDebit[] = [];
  let selectedId: string | null = null;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    ({ sources, summary } = await listCreditSources(db, user.id));
    // On a wide screen a credit is always open: the one chosen, or the newest.
    selectedId = c && sources.some((s) => s.id === c) ? c : (sources[0]?.id ?? null);
    if (selectedId) debits = await getCreditDebits(db, user.id, selectedId);
  } catch (error) {
    console.error("[credit-history] could not load", error);
    return (
      <>
        <PageHeader title="Credit History" />
        <DatabaseUnavailable />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Credit History" />
      <CreditHistoryView sources={sources} summary={summary} selectedId={selectedId} hasSelection={c !== null && sources.some((s) => s.id === c)} debits={debits} setDefault={setDefaultCreditAction} />
    </>
  );
}
