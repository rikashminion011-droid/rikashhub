"use client";

import { ImageUp, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DatePicker, TimePicker } from "@/components/shared/date-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AddResult } from "@/features/quick-pay/components/inline-add";
import { PeoplePicker } from "@/features/quick-pay/components/people-picker";
import { istDateOf, istTimeOf } from "@/features/quick-pay/datetime";
import { cn } from "@/lib/utils";
import type { ShoppingActions } from "../actions";
import type { PlatformRow, PurchaseRow } from "../server/service";

/** Shrinks a big photo before it is uploaded, so a phone picture does not take long or hit the size limit. */
export async function shrinkImage(file: File): Promise<File> {
  if (file.size <= 900 * 1024 && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob ? new File([blob], "purchase.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export async function uploadPurchaseImage(id: string, file: File): Promise<string | null> {
  const body = new FormData();
  body.set("file", await shrinkImage(file));
  try {
    const res = await fetch(`/shopping/image/${id}`, { method: "POST", body });
    const json = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
    return json?.ok ? null : (json?.error ?? "Could not save the image.");
  } catch {
    return "Could not reach the server. Check your connection and try again.";
  }
}

interface Draft {
  platformId: string;
  date: string;
  time: string;
  reason: string;
  amount: string;
  recipientIds: string[];
}

/** Add a purchase (all five fields are required) or edit one. The image can stay as it is when editing. */
export function PurchaseDialog({
  open,
  onOpenChange,
  editing,
  platforms,
  defaultPlatformId,
  people,
  onAddPerson,
  actions,
  today,
  now,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: PurchaseRow | null;
  platforms: PlatformRow[];
  defaultPlatformId: string | null;
  people: { id: string; name: string }[];
  onAddPerson: (name: string) => Promise<AddResult>;
  actions: Pick<ShoppingActions, "createPurchase" | "updatePurchase">;
  today: string;
  now: string;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        {open ? <Body key={editing?.id ?? "new"} editing={editing} platforms={platforms} defaultPlatformId={defaultPlatformId} people={people} onAddPerson={onAddPerson} actions={actions} today={today} now={now} onClose={() => onOpenChange(false)} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({ editing, platforms, defaultPlatformId, people, onAddPerson, actions, today, now, onClose, onSaved }: Omit<Parameters<typeof PurchaseDialog>[0], "open" | "onOpenChange"> & { onClose: () => void }) {
  const at = editing ? new Date(editing.occurredAt) : null;
  const [draft, setDraft] = useState<Draft>({
    platformId: editing?.platformId ?? defaultPlatformId ?? platforms[0]?.id ?? "",
    date: at ? istDateOf(at) : today,
    time: at ? istTimeOf(at) : now,
    reason: editing?.reason ?? "",
    amount: editing ? (editing.amountPaise / 100).toFixed(2) : "",
    recipientIds: editing?.recipientIds ?? [],
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(editing?.hasImage ? `/shopping/image/${editing.id}` : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (preview?.startsWith("blob:") && URL.revokeObjectURL(preview)), [preview]);

  function choose(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Choose an image file.");
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function save() {
    if (!draft.platformId) return setError("Choose a shopping platform.");
    if (!file && !preview) return setError("Upload the image.");
    if (!draft.reason.trim()) return setError("Enter a reason.");
    if (draft.recipientIds.length === 0) return setError("Choose at least one recipient.");
    if (!draft.amount.trim()) return setError("Enter the purchase amount.");
    setSaving(true);
    setError(null);
    let id = editing?.id ?? "";
    if (editing) {
      const r = await actions.updatePurchase({ id: editing.id, purchase: draft });
      if (!r.ok) {
        setSaving(false);
        return setError(r.error);
      }
    } else {
      const r = await actions.createPurchase({ key, purchase: draft });
      if (!r.ok) {
        setSaving(false);
        return setError(r.error);
      }
      id = r.id;
    }
    if (file) {
      const problem = await uploadPurchaseImage(id, file);
      if (problem) {
        setSaving(false);
        onSaved();
        toast.error(`The purchase was saved, but the image was not: ${problem} Open Edit to add it again.`);
        return onClose();
      }
    }
    setSaving(false);
    toast.success(editing ? "Purchase updated." : "Purchase added.");
    onSaved();
    onClose();
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle>{editing ? "Edit purchase" : "Add New Purchase"}</DialogTitle>
        <DialogDescription>All five fields are required.</DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor="sp-platform">Shopping platform</Label>
        <select id="sp-platform" value={draft.platformId} onChange={(e) => setDraft({ ...draft, platformId: e.target.value })} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm">
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label>1. Purchase date and time</Label>
        <div className="grid grid-cols-2 gap-2">
          <DatePicker ariaLabel="Purchase date" value={draft.date} max={today} onChange={(d) => setDraft({ ...draft, date: d })} className="h-10" />
          <TimePicker ariaLabel="Purchase time" value={draft.time} onChange={(t) => setDraft({ ...draft, time: t })} className="h-10" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>2. Upload image</Label>
        <input ref={input} type="file" accept="image/*" className="sr-only" aria-label="Purchase image" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
        {preview ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- a private, user-uploaded image */}
            <img src={preview} alt="Purchase" className="max-h-56 w-full rounded-lg border bg-muted/30 object-contain" />
            <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
              <ImageUp /> Change image
            </Button>
          </div>
        ) : (
          <button type="button" onClick={() => input.current?.click()} className={cn("flex h-24 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted/40")}>
            <ImageUp className="size-5" aria-hidden /> Choose an image
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sp-reason">3. Reason</Label>
        <Input id="sp-reason" maxLength={300} placeholder="What was bought" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} className="h-10 text-base sm:text-sm" />
      </div>

      <div className="space-y-1.5">
        <Label>4. Recipients</Label>
        <PeoplePicker ariaLabel="Recipients" people={people} selected={draft.recipientIds} onChange={(ids) => setDraft({ ...draft, recipientIds: ids })} onAddPerson={onAddPerson} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sp-amount">5. Purchase amount</Label>
        <Input id="sp-amount" inputMode="decimal" placeholder="0.00" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} className="h-10 text-right text-base tabular-nums sm:text-sm" />
      </div>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null} {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
