import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DatabaseUnavailable } from "@/components/shared/database-unavailable";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { addShoppingRecipientAction, saveItemsAction } from "@/features/shopping/actions";
import { ItemsEditor } from "@/features/shopping/components/items-editor";
import { getPurchase, type PurchaseDetail } from "@/features/shopping/server/service";
import { formatClock, formatLongDate } from "@/features/quick-pay/date-format";
import { istDateOf, istTimeOf } from "@/features/quick-pay/datetime";
import { getQuickPayOptions } from "@/features/quick-pay/server/settings";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Purchase details" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One purchase: its date, reason and total at the top, the editable item table on the left and the receipt image beside it. */
export default async function PurchasePage({ params }: PageProps<"/shopping/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  let purchase: PurchaseDetail | null;
  let people: { id: string; name: string }[];
  try {
    const db = getPrisma();
    await ensureUserSetup(db, user);
    [purchase, people] = await Promise.all([getPurchase(db, user.id, id), getQuickPayOptions(db, user.id).then((o) => o.persons.map((p) => ({ id: p.id, name: p.name })))]);
  } catch (error) {
    console.error("[shopping] purchase could not load", error);
    return (
      <>
        <PageHeader title="Purchase details" />
        <DatabaseUnavailable />
      </>
    );
  }
  if (!purchase) notFound();

  const at = new Date(purchase.occurredAt);
  return (
    <>
      <PageHeader
        title={`${purchase.platformName} ${purchase.number}`}
        description={purchase.pending ? "Pending: add the image, recipients and the items, then save the details." : "All details are filled in."}
        actions={
          <Link href={`/shopping?platform=${purchase.platformId}`} className={cn(buttonVariants({ variant: "outline" }))}>
            <ChevronLeft /> Back
          </Link>
        }
      />
      <div className="space-y-5">
        <dl className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Purchase date and time</dt>
            <dd className="font-medium">
              {formatLongDate(istDateOf(at))}, {formatClock(istTimeOf(at))}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Reason</dt>
            <dd className="font-medium break-words">{purchase.reason}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Total purchase amount</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatINR(purchase.amountPaise)}</dd>
          </div>
        </dl>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,13fr)_minmax(0,7fr)]">
          <ItemsEditor purchaseId={purchase.id} totalPaise={purchase.amountPaise} saved={purchase.items} people={people} saveItems={saveItemsAction} addPerson={addShoppingRecipientAction} />
          <div className="lg:sticky lg:top-4 lg:self-start">
            {purchase.hasImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- a private, user-uploaded image
              <img src={`/shopping/image/${purchase.id}`} alt={`Receipt of ${purchase.platformName} ${purchase.number}`} className="h-auto max-h-[80vh] w-full rounded-xl border bg-muted/30 object-contain" />
            ) : (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No image yet. Add one from Edit on the Shopping Records page.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
