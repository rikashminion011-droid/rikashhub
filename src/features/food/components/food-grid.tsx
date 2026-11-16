"use client";

import { Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/option-dialogs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatClock, formatLongDate } from "@/features/quick-pay/date-format";
import { cn } from "@/lib/utils";
import type { FoodGridActions } from "../actions";
import { formatRupeesPlain, type GridDay, type GridEntry } from "../grid";
import { MAX_NOTES_LENGTH, MEALS, MEAL_LABEL, NIL_NOTES, type Meal } from "../pricing";

/**
 * Date | Tiffin | Lunch | Dinner | Total. Each meal shows what was had with its amount under it. A meal that was not eaten
 * shows a bold Nil. Each entry can be edited or deleted from its three-dot menu. Only the date is shown, not the time.
 */
export function FoodGrid({ days, totalPaise, actions }: { days: GridDay[]; totalPaise: number; actions: FoodGridActions }) {
  const router = useRouter();
  const [editing, setEditing] = useState<GridEntry | null>(null);
  const [deleting, setDeleting] = useState<GridEntry | null>(null);

  if (days.length === 0) {
    return <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">No meals recorded for this period. Save one from Quick Entry (Food Entry) or use Add Bulk.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">Date</th>
              {MEALS.map((m) => (
                <th key={m} scope="col" className="px-3 py-2.5 text-left font-medium">
                  {MEAL_LABEL[m]}
                </th>
              ))}
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {days.map((day) => (
              <tr key={day.date} className="align-top hover:bg-muted/30">
                <td className="px-3 py-2.5 font-medium whitespace-nowrap">{formatLongDate(day.date)}</td>
                {MEALS.map((meal) => (
                  <td key={meal} className="px-3 py-2">
                    {day.cells[meal].length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <ul className="space-y-1.5">
                        {day.cells[meal].map((entry) => (
                          <li key={entry.id} className="flex items-start justify-between gap-1">
                            <div className="min-w-0">
                              <p className={cn("break-words", entry.nil && "text-base font-extrabold text-black")}>{entry.notes}</p>
                              {entry.nil ? null : <p className="text-xs text-muted-foreground tabular-nums">{formatRupeesPlain(entry.amountPaise)}</p>}
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${entry.notes}`} className="-my-1 size-7 shrink-0 text-muted-foreground" />}>
                                <MoreVertical />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-36">
                                <DropdownMenuItem onClick={() => setEditing(entry)}>
                                  <Pencil /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setDeleting(entry)} className="text-destructive focus:text-destructive">
                                  <Trash2 /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums">{formatRupeesPlain(day.totalPaise)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-3 py-2.5" colSpan={4}>
                Total
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatRupeesPlain(totalPaise)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <EditDialog entry={editing} onClose={() => setEditing(null)} updateEntry={actions.updateEntry} onSaved={() => router.refresh()} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this meal?"
        description={deleting ? `${MEAL_LABEL[deleting.meal]} · ${deleting.notes}. The totals are worked out again.` : ""}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return null;
          const r = await actions.deleteEntry({ id: deleting.id });
          if (!r.ok) return r.error;
          toast.success("Meal deleted. Totals updated.");
          router.refresh();
          return null;
        }}
      />
    </>
  );
}

function EditDialog({ entry, onClose, updateEntry, onSaved }: { entry: GridEntry | null; onClose: () => void; updateEntry: FoodGridActions["updateEntry"]; onSaved: () => void }) {
  return (
    <Dialog open={entry !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">{entry ? <EditBody key={entry.id} entry={entry} onClose={onClose} updateEntry={updateEntry} onSaved={onSaved} /> : null}</DialogContent>
    </Dialog>
  );
}

function EditBody({ entry, onClose, updateEntry, onSaved }: { entry: GridEntry; onClose: () => void; updateEntry: FoodGridActions["updateEntry"]; onSaved: () => void }) {
  const [meal, setMeal] = useState<Meal>(entry.meal);
  const [nil, setNil] = useState(entry.nil);
  const [notes, setNotes] = useState(entry.nil ? "" : entry.notes);
  // Left empty, the amount is worked out again from your Customize prices.
  const [amount, setAmount] = useState(entry.nil ? "" : (entry.amountPaise / 100).toFixed(2).replace(/\.00$/, ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const r = await updateEntry({ id: entry.id, meal, notes: nil ? NIL_NOTES : notes, ...(nil || amount.trim() === "" ? {} : { amount }) });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast.success("Meal updated.");
    onSaved();
    onClose();
  }

  const when = new Date(entry.occurredAt);
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-3"
    >
      <DialogHeader>
        <DialogTitle>Edit meal</DialogTitle>
        <DialogDescription>
          {formatLongDate(when.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }))}, {formatClock(when.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }))}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="fe-meal">Meal</Label>
          <select id="fe-meal" value={meal} onChange={(e) => setMeal(e.target.value as Meal)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm">
            {MEALS.map((m) => (
              <option key={m} value={m}>
                {MEAL_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        <label className="flex h-10 cursor-pointer items-center gap-2 text-sm font-semibold">
          <Checkbox checked={nil} onCheckedChange={(next) => setNil(next === true)} aria-label="Nil: no meal was eaten" />
          Nil
        </label>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fe-notes">Notes</Label>
        <Input id="fe-notes" maxLength={MAX_NOTES_LENGTH} disabled={nil} value={nil ? NIL_NOTES : notes} onChange={(e) => setNotes(e.target.value)} className="h-10 text-base sm:text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fe-amount">Amount (leave empty to use your prices)</Label>
        <Input id="fe-amount" inputMode="decimal" disabled={nil} placeholder="0" value={nil ? "0" : amount} onChange={(e) => setAmount(e.target.value)} className="h-10 text-right text-base tabular-nums sm:text-sm" />
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null} Save
        </Button>
      </DialogFooter>
    </form>
  );
}
