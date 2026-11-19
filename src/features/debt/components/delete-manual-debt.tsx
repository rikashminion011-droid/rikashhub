"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteDebtEntryAction } from "../actions";

/** Removes a debt that was added by hand. */
export function DeleteManualDebt({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label="Remove this debt"
      title="Remove this debt"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await deleteDebtEntryAction({ id });
          if (!r.ok) toast.error(r.error);
          else toast.success("Debt removed.");
          router.refresh();
        })
      }
      className="ml-2 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}
