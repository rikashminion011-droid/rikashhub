"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/option-dialogs";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { deleteEntryAction } from "../actions";

/** Edit (opens the entry in Quick Entry) and Delete (with confirmation) for one transaction row. */
export function RowActions({ id, summary, deleteEntry }: { id: string; summary: string; deleteEntry: typeof deleteEntryAction }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  async function remove(): Promise<string | null> {
    const result = await deleteEntry({ id });
    if (!result.ok) return result.error;
    toast.success("Entry deleted. Totals and balances updated.");
    router.refresh();
    return null;
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Link href={`/quick-pay?entry=${id}`} aria-label={`Edit ${summary}`} className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}>
        <Pencil />
      </Link>
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${summary}`} className="text-muted-foreground hover:text-destructive" onClick={() => setConfirming(true)}>
        <Trash2 />
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this transaction?"
        description={`${summary} will be removed from GPay Transactions, and the totals and the bank balance will be recalculated. This cannot be undone.`}
        confirmLabel="Delete transaction"
        onConfirm={remove}
      />
    </div>
  );
}
