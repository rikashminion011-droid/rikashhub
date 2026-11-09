"use client";

import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * A small "add something" dialog: one name box, optional extra controls, Save / Cancel.
 * `onSave` returns an error message to show, or null when it worked (the dialog then closes).
 * The form inside is only mounted while the dialog is open, so it starts empty every time.
 */
export function AddOptionDialog({
  open,
  onOpenChange,
  title,
  description,
  label = "Name",
  placeholder,
  saveLabel = "Save",
  initialValue = "",
  extra,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  saveLabel?: string;
  /** Pre-filled text, for renaming. */
  initialValue?: string;
  extra?: ReactNode;
  onSave: (name: string) => Promise<string | null>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <AddOptionForm
          title={title}
          description={description}
          label={label}
          placeholder={placeholder}
          saveLabel={saveLabel}
          initialValue={initialValue}
          extra={extra}
          onSave={onSave}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddOptionForm({
  title,
  description,
  label,
  placeholder,
  saveLabel,
  initialValue,
  extra,
  onSave,
  onDone,
}: {
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  saveLabel: string;
  initialValue: string;
  extra?: ReactNode;
  onSave: (name: string) => Promise<string | null>;
  onDone: () => void;
}) {
  const [name, setName] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!name.trim()) {
      setError("Enter a name.");
      return;
    }
    setSaving(true);
    setError(null);
    const message = await onSave(name);
    setSaving(false);
    if (message) setError(message);
    else onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor="option-name">{label}</Label>
        <Input
          id="option-name"
          autoFocus
          autoComplete="off"
          maxLength={60}
          value={name}
          placeholder={placeholder}
          aria-invalid={!!error}
          aria-describedby={error ? "option-name-error" : undefined}
          onChange={(e) => setName(e.target.value)}
        />
        {error ? (
          <p id="option-name-error" role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {extra}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {saveLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** "Remove X?" confirmation. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Remove",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => Promise<string | null>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <ConfirmBody
          title={title}
          description={description}
          confirmLabel={confirmLabel}
          onConfirm={onConfirm}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ConfirmBody({
  title,
  description,
  confirmLabel,
  onConfirm,
  onDone,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<string | null>;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    const message = await onConfirm();
    setBusy(false);
    if (message) setError(message);
    else onDone();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" onClick={confirm} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {confirmLabel}
        </Button>
      </DialogFooter>
    </>
  );
}
