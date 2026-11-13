"use client";

import { ArrowLeftRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { saveTransferAction } from "../actions";
import type { QuickPayOptions } from "../types";
import { TransferForm } from "./transfer-form";

/** The "Self Transfer" choice in a Bank Through list opens this pop-up: from which bank, to which bank, the amount and a reason. */
export function SelfTransferDialog({
  open,
  onOpenChange,
  options,
  saveTransfer,
  fixedAmount,
  initialReason,
  when,
  onChoose,
  initial,
}: {
  onChoose?: (choice: { fromId: string; toId: string; amount: string; reason: string }) => void;
  initial?: { fromId: string | null; toId: string | null };
  fixedAmount?: string;
  initialReason?: string;
  when?: { date: string; time: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: QuickPayOptions;
  saveTransfer: typeof saveTransferAction;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-visible sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="size-4" aria-hidden /> Self Transfer
          </DialogTitle>
          <DialogDescription>Move money from one of your banks to another. Both balances change, and it shows as one transaction.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so it always starts empty */}
        {open ? <TransferForm options={options} saveTransfer={saveTransfer} onSaved={() => onOpenChange(false)} fixedAmount={fixedAmount} initialReason={initialReason} when={when} onChoose={onChoose} initial={initial} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** The item at the bottom of a Bank Through dropdown that opens the Self Transfer pop-up. */
export function SelfTransferItem({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium hover:bg-accent hover:text-accent-foreground">
      <ArrowLeftRight className="size-3.5" aria-hidden />
      Self Transfer
    </button>
  );
}
