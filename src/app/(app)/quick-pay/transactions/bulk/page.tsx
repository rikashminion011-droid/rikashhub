import type { Metadata } from "next";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { addCategoryAction, getOptionsAction, saveBulkAction, saveTransferAction } from "@/features/quick-pay/actions";
import { addPersonAction } from "@/features/users/actions";
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
      <PageHeader title="Add Bulk" />
      {/* The sheet is allowed to use the whole width of the screen, not only the page's usual column, so every column can be read in full */}
      <div className="relative left-1/2 w-[min(calc(100vw-4rem),120rem)] -translate-x-1/2">
      <BulkEntry options={options} today={istDateOf(now)} nowTime={istTimeOf(now)} saveBulk={saveBulkAction} quickActions={{ addCategory: addCategoryAction, addPerson: addPersonAction, getOptions: getOptionsAction, saveTransfer: saveTransferAction }} />
      </div>
    </>
  );
}
