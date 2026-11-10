import type { Metadata } from "next";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { saveBulkAction } from "@/features/quick-pay/actions";
import { BulkEntry } from "@/features/quick-pay/components/bulk-entry";
import { istDateOf, istTimeOf } from "@/features/quick-pay/datetime";
import { getQuickPayOptions } from "@/features/quick-pay/server/settings";
import type { QuickPayOptions } from "@/features/quick-pay/types";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Add Bulk" };

export default async function BulkPage() {
  const user = await requireUser();

  let options: QuickPayOptions;
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    options = await getQuickPayOptions(db, user.id);
  } catch (error) {
    console.error("[quick-pay] could not load options for bulk entry", error);
    return (
      <>
        <PageHeader title="Add Bulk" />
        <DatabaseUnavailable />
      </>
    );
  }

  const now = new Date();
  return (
    <>
      <PageHeader title="Add Bulk" description="Enter many transactions at once. Each row is saved as its own entry under its own date and time." />
      <BulkEntry options={options} today={istDateOf(now)} nowTime={istTimeOf(now)} saveBulk={saveBulkAction} />
    </>
  );
}
