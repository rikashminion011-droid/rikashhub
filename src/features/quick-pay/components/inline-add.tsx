"use client";

import { Loader2, Plus } from "lucide-react";
import { useState } from "react";

export type AddResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * A small "type a name, press Add" box that lives at the bottom of a dropdown, so a new category or person can be created
 * without leaving the page. The new one is handed back so the caller can select it. Enter adds it (it never submits the form).
 */
export function InlineAdd({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (name: string) => Promise<AddResult> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed || busy) {
      if (!trimmed) setError("Type a name first.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await onAdd(trimmed);
    setBusy(false);
    if (result.ok) setName("");
    else setError(result.error);
  }

  return (
    <div className="space-y-1 p-1.5">
      <div className="flex items-center gap-1.5">
        <input
          value={name}
          aria-label={label}
          placeholder={placeholder}
          maxLength={60}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            // Never let Enter submit the entry form.
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              void add();
            }
          }}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 sm:text-sm"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy}
          className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-neutral-900 px-2.5 text-xs font-semibold text-white outline-none hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
          Add
        </button>
      </div>
      {error ? (
        <p role="alert" className="px-0.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
