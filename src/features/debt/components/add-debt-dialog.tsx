"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { addDebtEntriesAction } from "../actions";

interface Row {
  key: number;
  reason: string;
  amount: string;
}

/**
 * Add Debt: a pop-up of Reason and Amount rows for one recipient. Add row gives another line; Save adds every row to that
 * person's debt, so it shows in their total and in the transactions behind it.
 */
export function AddDebtDialog({ partyId, name, add }: { partyId: string; name: string; add: typeof addDebtEntriesAction }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ key: 0, reason: "", amount: "" }]);
  const [next, setNext] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: number, patch: Partial<Row>) => {
    setError(null);
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  async function save() {
    setError(null);
    setSaving(true);
    const result = await add({ partyId, rows: rows.map((r) => ({ reason: r.reason, amount: r.amount })) });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    toast.success(`Debt added to ${name}.`);
    setRows([{ key: next, reason: "", amount: "" }]);
    setNext((n) => n + 1);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" />}>
        <Plus /> Add Debt
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Debt · {name}</DialogTitle>
          <DialogDescription>Each row is added to {name}&apos;s debt and shows in their total.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          <div className="grid grid-cols-[1fr_8rem_2.25rem] gap-2 text-xs font-medium text-muted-foreground">
            <span>Reason</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[1fr_8rem_2.25rem] items-center gap-2">
              <Input value={r.reason} onChange={(e) => update(r.key, { reason: e.target.value })} aria-label="Reason" placeholder="Reason" maxLength={200} className="h-10 text-base sm:text-sm" />
              <Input value={r.amount} onChange={(e) => update(r.key, { amount: e.target.value })} aria-label="Amount" inputMode="decimal" placeholder="0" className="h-10 text-right text-base tabular-nums sm:text-sm" />
              <button type="button" aria-label="Remove row" disabled={rows.length === 1} onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))} className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => {
            setRows((list) => [...list, { key: next, reason: "", amount: "" }]);
            setNext((n) => n + 1);
          }}
        >
          <Plus /> Add row
        </Button>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
