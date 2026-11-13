"use client";

import { Loader2, Plus, RotateCcw, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CascadingSelect } from "@/components/shared/cascading-select";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { formatINR, parseAmountInput } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { resetSettingsAction, saveSettingsAction } from "../actions";
import { groupBanks, groupCategories } from "../cascade";
import {
  CREDIT_SELECTIONS,
  CREDIT_SOURCES,
  CREDIT_SOURCE_LABEL,
  DEFAULT_LABELS,
  FIELD_KEYS,
  tidyPercents,
  type CreditSelection,
  type CreditSource,
  type CreditsSettings,
  type FieldsSettings,
  type QuickPaySettingsData,
  type SettingsSection,
  type SplitSettings,
} from "../settings-model";
import { formatPercent, parsePercent } from "../split";
import type { QuickPayOptions } from "../types";

export interface SettingsFormActions {
  save: typeof saveSettingsAction;
  reset: typeof resetSettingsAction;
}

const FIELD_NAME: Record<(typeof FIELD_KEYS)[number], string> = {
  amount: "Amount",
  reason: "Reason",
  category: "Category",
  bank: "Bank Through",
  split: "Split",
  creditsAdded: "Credits Added",
};

function SectionCard({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer: ReactNode }) {
  return (
    <Card className="overflow-visible">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {children}
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">{footer}</div>
      </CardContent>
    </Card>
  );
}

/** Save and Reset buttons that go with each section. */
function SaveBar({ dirty, saving, error, onSave, onReset }: { dirty: boolean; saving: boolean; error: string | null; onSave: () => void; onReset: () => void }) {
  return (
    <>
      <Button type="button" onClick={onSave} disabled={!dirty || saving}>
        {saving ? <Loader2 className="animate-spin" /> : null}
        {saving ? "Saving…" : "Save changes"}
      </Button>
      <Button type="button" variant="ghost" onClick={onReset} disabled={saving}>
        <RotateCcw /> Reset to defaults
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      ) : !dirty ? (
        <p className="text-xs text-muted-foreground">Saved. Changes show everywhere as soon as you save.</p>
      ) : null}
    </>
  );
}

/** Shared save / reset behaviour for the three sections. */
function useSection<K extends SettingsSection>(
  section: K,
  saved: QuickPaySettingsData[K],
  actions: SettingsFormActions,
  onSaved: (settings: QuickPaySettingsData) => void,
) {
  const [draft, setDraft] = useState<QuickPaySettingsData[K]>(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  async function save() {
    setSaving(true);
    setError(null);
    const result = await actions.save({ section, value: draft });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    setDraft(result.settings[section]);
    onSaved(result.settings);
    toast.success("Settings saved.");
  }
  async function reset() {
    setSaving(true);
    setError(null);
    const result = await actions.reset({ section });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    setDraft(result.settings[section]);
    onSaved(result.settings);
    toast.success("Back to the defaults.");
  }
  return { draft, setDraft, saving, error, dirty, save, reset };
}

// ───────────────────────── Fields and defaults ─────────────────────────

export function FieldsSection({ settings, options, actions, onSaved }: { settings: FieldsSettings; options: QuickPayOptions; actions: SettingsFormActions; onSaved: (s: QuickPaySettingsData) => void }) {
  const { draft, setDraft, saving, error, dirty, save, reset } = useSection("fields", settings, actions, onSaved);
  const bankGroups = useMemo(() => groupBanks(options.banks), [options.banks]);
  const categoryGroups = useMemo(() => groupCategories(options.categories), [options.categories]);

  return (
    <SectionCard
      title="Fields & Defaults"
      description="Rename the fields, and choose what is selected when Quick Entry opens. Labels and defaults apply in Quick Entry, the edit pop-up and the GPay Transactions table."
      footer={<SaveBar dirty={dirty} saving={saving} error={error} onSave={save} onReset={reset} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELD_KEYS.map((key) => (
          <div key={key} className="space-y-1">
            <label htmlFor={`label-${key}`} className="text-xs font-semibold text-muted-foreground">
              {FIELD_NAME[key]} label
            </label>
            <Input
              id={`label-${key}`}
              value={draft.labels[key]}
              maxLength={30}
              placeholder={DEFAULT_LABELS[key]}
              onChange={(e) => setDraft({ ...draft, labels: { ...draft.labels, [key]: e.target.value } })}
              className="h-10 text-base sm:text-sm"
            />
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-semibold">Selected when Quick Entry opens</p>
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">Type</p>
          <div role="radiogroup" aria-label="Default type" className="flex gap-2">
            {(["DEBIT", "CREDIT"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={draft.defaults.type === t}
                onClick={() => setDraft({ ...draft, defaults: { ...draft.defaults, type: t } })}
                className={cn("h-9 rounded-lg border px-4 text-sm font-medium", draft.defaults.type === t ? "border-neutral-950 bg-neutral-950 text-white" : "hover:bg-muted")}
              >
                {t === "DEBIT" ? "Debit" : "Credit"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">{draft.labels.bank}</p>
            <CascadingSelect
              ariaLabel="Default bank"
              groups={bankGroups}
              value={draft.defaults.bankId}
              onChange={(v) => setDraft({ ...draft, defaults: { ...draft.defaults, bankId: v } })}
              placeholder="Empty (choose each time)"
              clearable
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">{draft.labels.category}</p>
            <CascadingSelect
              ariaLabel="Default category"
              groups={categoryGroups}
              value={draft.defaults.categoryId}
              onChange={(v) => setDraft({ ...draft, defaults: { ...draft.defaults, categoryId: v } })}
              placeholder="Empty (choose each time)"
              clearable
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Leave a default empty and that field starts empty. A keyword in the Reason can still pick the category.</p>
      </div>
    </SectionCard>
  );
}

// ───────────────────────── Split ─────────────────────────

export function SplitSection({ settings, options, actions, onSaved }: { settings: SplitSettings; options: QuickPayOptions; actions: SettingsFormActions; onSaved: (s: QuickPaySettingsData) => void }) {
  const { draft, setDraft, saving, error, dirty, save, reset } = useSection("split", settings, actions, onSaved);
  const [newPercent, setNewPercent] = useState("");
  const [percentError, setPercentError] = useState<string | null>(null);
  const persons = options.persons.map((p) => ({ value: p.id, label: p.name }));
  const exampleShare = draft.method === "PERCENT" ? Math.round((40000 * draft.defaultPercent) / 100) : Math.min(draft.defaultFixedPaise, 40000);

  function addPercent() {
    const value = parsePercent(newPercent);
    if (value === null) return setPercentError("Enter a percentage above 0, up to 100.");
    if (draft.percentOptions.includes(value)) return setPercentError(`${formatPercent(value)} is already in the list.`);
    if (draft.percentOptions.length >= 20) return setPercentError("At most 20 percentages.");
    setDraft({ ...draft, percentOptions: tidyPercents([...draft.percentOptions, value]) });
    setNewPercent("");
    setPercentError(null);
  }

  return (
    <SectionCard
      title="Split Settings"
      description="How Split works in Quick Entry: the default share, the percentages offered, and who is selected. A person's share of the amount is worked out automatically and added to their record in Debt Management."
      footer={<SaveBar dirty={dirty} saving={saving} error={error} onSave={save} onReset={reset} />}
    >
      <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
        <Checkbox checked={draft.enabledByDefault} onCheckedChange={(v) => setDraft({ ...draft, enabledByDefault: v === true })} />
        Split is ticked by default when Quick Entry opens
      </label>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Calculation method</p>
        <div role="radiogroup" aria-label="Split calculation method" className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["PERCENT", "Percentage of the amount", "Pick a percentage. ₹400 at 50% gives the person ₹200."],
              ["FIXED", "Fixed amount", "Type the person's share. Their percentage is worked out."],
            ] as const
          ).map(([value, title, text]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={draft.method === value}
              onClick={() => setDraft({ ...draft, method: value })}
              className={cn("rounded-xl border p-3 text-left", draft.method === value ? "border-neutral-950 bg-neutral-50" : "hover:bg-muted/50")}
            >
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{text}</p>
            </button>
          ))}
        </div>
      </div>

      {draft.method === "PERCENT" ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-sm font-semibold">Percentages in the Split dropdown</p>
            <ul className="flex flex-wrap gap-1.5" aria-label="Available percentages">
              {draft.percentOptions.map((p) => (
                <li key={p} className="flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-1 pl-3 text-sm">
                  {formatPercent(p)}
                  <button
                    type="button"
                    aria-label={`Remove ${formatPercent(p)}`}
                    disabled={draft.percentOptions.length <= 1}
                    onClick={() => setDraft({ ...draft, percentOptions: draft.percentOptions.filter((x) => x !== p), defaultPercent: draft.defaultPercent === p ? (draft.percentOptions.find((x) => x !== p) ?? 50) : draft.defaultPercent })}
                    className="rounded-full p-1 text-muted-foreground hover:bg-background hover:text-destructive disabled:opacity-30"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                addPercent();
              }}
              className="flex items-center gap-2"
            >
              <Input aria-label="New percentage" inputMode="decimal" placeholder="e.g. 18" value={newPercent} onChange={(e) => setNewPercent(e.target.value)} className="h-9 w-28 text-base sm:text-sm" />
              <Button type="submit" size="sm" variant="outline">
                <Plus /> Add
              </Button>
            </form>
            {percentError ? <p role="alert" className="text-xs text-destructive">{percentError}</p> : <p className="text-xs text-muted-foreground">You can also type any percentage in Quick Entry with &quot;Custom…&quot;.</p>}
          </div>

          <div className="space-y-1">
            <label htmlFor="default-percent" className="text-sm font-semibold">
              Default percentage
            </label>
            <select
              id="default-percent"
              value={String(draft.defaultPercent)}
              onChange={(e) => setDraft({ ...draft, defaultPercent: Number(e.target.value) })}
              className="block h-10 w-40 rounded-lg border border-input bg-background px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
            >
              {draft.percentOptions.map((p) => (
                <option key={p} value={String(p)}>
                  {formatPercent(p)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <label htmlFor="default-fixed" className="text-sm font-semibold">
            Default share (₹)
          </label>
          <Input
            id="default-fixed"
            inputMode="decimal"
            placeholder="Empty"
            value={draft.defaultFixedPaise > 0 ? String(draft.defaultFixedPaise / 100) : ""}
            onChange={(e) => {
              const paise = e.target.value.trim() === "" ? 0 : parseAmountInput(e.target.value);
              if (paise !== null) setDraft({ ...draft, defaultFixedPaise: paise });
            }}
            className="h-10 w-40 text-base sm:text-sm"
          />
          <p className="text-xs text-muted-foreground">Leave empty to type the share every time.</p>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-sm font-semibold">Default person</p>
        <div className="max-w-xs">
          <SearchableSelect
            ariaLabel="Default person"
            options={persons}
            value={draft.defaultPartyId}
            onChange={(v) => setDraft({ ...draft, defaultPartyId: v })}
            placeholder="Empty (choose each time)"
            searchPlaceholder="Search people…"
            clearable
          />
        </div>
      </div>

      <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        {draft.method === "FIXED" && draft.defaultFixedPaise === 0 ? (
          "Example: you type the person's share each time, and their percentage is worked out from it."
        ) : (
          <>
            Example: a {formatINR(40000)} transaction with these settings gives the person <span className="font-semibold text-foreground">{formatINR(exampleShare)}</span>
            {draft.method === "PERCENT" ? ` (${formatPercent(draft.defaultPercent)})` : ""}.
          </>
        )}
      </p>
    </SectionCard>
  );
}

// ───────────────────────── Credits Added ─────────────────────────

const SOURCE_TEXT: Record<CreditSource, string> = {
  recent_credits: "The latest credits (money in), newest first.",
  recent_transactions: "The latest transactions of any kind.",
  credit_values: "Each different credit amount once, newest first.",
  last_transaction: "Only the most recent transaction.",
};

const SELECTION_LABEL: Record<CreditSelection, string> = {
  none: "Empty by default",
  latest: "Latest credit",
  custom: "Custom: the newest few",
};

export function CreditsSection({ settings, actions, onSaved }: { settings: CreditsSettings; actions: SettingsFormActions; onSaved: (s: QuickPaySettingsData) => void }) {
  const { draft, setDraft, saving, error, dirty, save, reset } = useSection("credits", settings, actions, onSaved);

  return (
    <SectionCard
      title="Credits Added Settings"
      description="What the Credits Added panel in Quick Entry shows when you tick it, and what is ticked for you. You can always tick any row to add it to the debit."
      footer={<SaveBar dirty={dirty} saving={saving} error={error} onSave={save} onReset={reset} />}
    >
      <div className="space-y-2">
        <p className="text-sm font-semibold">Show</p>
        <div role="radiogroup" aria-label="What Credits Added shows" className="grid gap-2 sm:grid-cols-2">
          {CREDIT_SOURCES.map((source) => (
            <button
              key={source}
              type="button"
              role="radio"
              aria-checked={draft.source === source}
              onClick={() => setDraft({ ...draft, source })}
              className={cn("rounded-xl border p-3 text-left", draft.source === source ? "border-neutral-950 bg-neutral-50" : "hover:bg-muted/50")}
            >
              <p className="text-sm font-semibold">{CREDIT_SOURCE_LABEL[source]}</p>
              <p className="text-xs text-muted-foreground">{SOURCE_TEXT[source]}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="credits-size" className="text-sm font-semibold">
          How many to show
        </label>
        <Input
          id="credits-size"
          type="number"
          min={1}
          max={50}
          disabled={draft.source === "last_transaction"}
          value={draft.source === "last_transaction" ? 1 : draft.listSize}
          onChange={(e) => setDraft({ ...draft, listSize: Math.max(1, Math.min(50, Math.round(Number(e.target.value) || 1))) })}
          className="h-10 w-28 text-base sm:text-sm"
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Ticked when it opens</p>
        <div role="radiogroup" aria-label="Default selection" className="flex flex-wrap gap-2">
          {CREDIT_SELECTIONS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={draft.defaultSelection === value}
              onClick={() => setDraft({ ...draft, defaultSelection: value })}
              className={cn("h-9 rounded-lg border px-4 text-sm font-medium", draft.defaultSelection === value ? "border-neutral-950 bg-neutral-950 text-white" : "hover:bg-muted")}
            >
              {SELECTION_LABEL[value]}
            </button>
          ))}
        </div>
        {draft.defaultSelection === "custom" ? (
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="credits-custom">Tick the newest</label>
            <Input
              id="credits-custom"
              type="number"
              min={1}
              max={draft.listSize}
              value={Math.min(draft.customCount, draft.listSize)}
              onChange={(e) => setDraft({ ...draft, customCount: Math.max(1, Math.min(draft.listSize, Math.round(Number(e.target.value) || 1))) })}
              className="h-9 w-20 text-base sm:text-sm"
            />
            <span>credits</span>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
