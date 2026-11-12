"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/option-dialogs";
import { Button } from "@/components/ui/button";
import type { deleteFoodEntryAction } from "../actions";

/** Delete one saved food entry (with confirmation). The totals are worked out again from what is left. */
export function FoodRowActions({ id, summary, deleteEntry }: { id: string; summary: string; deleteEntry: typeof deleteFoodEntryAction }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  async function remove(): Promise<string | null> {
    const result = await deleteEntry({ id });
    if (!result.ok) return result.error;
    toast.success("Entry deleted. Totals updated.");
    router.refresh();
    return null;
  }

  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${summary}`} className="text-muted-foreground hover:text-destructive" onClick={() => setConfirming(true)}>
        <Trash2 />
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this food entry?"
        description={`${summary} will be removed from Monthly Food Tracking and the totals recalculated. This cannot be undone.`}
        confirmLabel="Delete entry"
        onConfirm={remove}
      />
    </>
  );
}
