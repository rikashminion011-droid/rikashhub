"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CascadingSelect } from "@/components/shared/cascading-select";
import { SortableList } from "@/components/shared/sortable-list";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { groupBanks, groupCategories } from "../cascade";
import {
  DEBT_COLUMNS,
  DEBT_COLUMN_LABEL,
  SWITCH_FEATURES,
  SWITCH_LABEL,
  type BanksSettings,
  type DebtSettings,
  type QuickPaySettingsData,
  type SwitchAllSettings,
  type SwitchFeature,
} from "../settings-model";
import { formatPercent } from "../split";
import type { BankOption, QuickPayOptions } from "../types";
import { SaveBar, SectionCard, useSection, type SettingsFormActions } from "./settings-sections";

type OnSaved = (s: QuickPaySettingsData) => void;

// ───────────────────────── Default bank / default category ─────────────────────────

/** Picks what is selected when Quick Entry opens. It is saved the moment you choose. */
export function DefaultChoice({
  kind,
  settings,
  options,
  actions,
  onSaved,
}: {
  kind: "bank" | "category";
  settings: QuickPaySettingsData["fields"];
  options: Pick<QuickPayOptions, "banks" | "categories">;
  actions: SettingsFormActions;
  onSaved: OnSaved;
}) {
  const [saving, setSaving] = useState(false);
  const groups = useMemo(() => (kind === "bank" ? groupBanks(options.banks) : groupCategories(options.categories)), [kind, options.banks, options.categories]);
  const value = kind === "bank" ? settings.defaults.bankId : settings.defaults.categoryId;
  const noun = kind === "bank" ? "bank" : "category";

  async function choose(next: string | null) {
    setSaving(true);
    const defaults = { ...settings.defaults, [kind === "bank" ? "bankId" : "categoryId"]: next };
    const result = await actions.save({ section: "fields", value: { ...settings, defaults } });
    setSaving(false);
    if (!result.ok) return void toast.error(result.error);
    onSaved(result.settings);
    toast.success(next ? `Default ${noun} saved.` : `No default ${noun}.`);
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold">Default {noun}</p>
      <div className={cn("max-w-sm", saving && "pointer-events-none opacity-60")}>
        <CascadingSelect ariaLabel={`Default ${noun}`} groups={groups} value={value} onChange={(v) => void choose(v)} placeholder="Empty (choose each time)" searchPlaceholder={`Search ${noun === "bank" ? "banks" : "categories"}…`} clearable />
      </div>
      <p className="text-xs text-muted-foreground">Selected when Quick Entry opens. Leave it empty to choose every time.</p>
    </div>
  );
}

// ───────────────────────── Which banks Quick Entry offers ─────────────────────────

/** The banks you can pick (a main file without accounts, or each account under one), in list order. */
export const bankLeaves = (banks: readonly BankOption[]) => banks;

export function BankVisibilitySection({ settings, banks, actions, onSaved }: { settings: BanksSettings; banks: readonly BankOption[]; actions: SettingsFormActions; onSaved: OnSaved }) {
  const { draft, setDraft, saving, error, dirty, save, reset } = useSection("banks", settings, actions, onSaved);
  const hidden = new Set(draft.hiddenIds);
  const groups = useMemo(() => {
    const map = new Map<string, BankOption[]>();
    for (const b of banks) map.set(b.mainName, [...(map.get(b.mainName) ?? []), b]);
    return [...map.entries()];
  }, [banks]);

  return (
    <SectionCard
      title="Banks shown in Quick Entry"
      description="Untick a bank to leave it out of the Bank Through dropdowns in Quick Entry and Self Transfer. It stays in your list, in balances and on past entries."
      footer={<SaveBar dirty={dirty} saving={saving} error={error} onSave={save} onReset={reset} />}
    >
      {banks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add a bank above first.</p>
      ) : (
        <div className="space-y-4">
          {groups.map(([main, list]) => (
            <div key={main} className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase">{main}</p>
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                {list.map((bank) => (
                  <li key={bank.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={!hidden.has(bank.id)}
                        onCheckedChange={(v) => setDraft({ ...draft, hiddenIds: v === true ? draft.hiddenIds.filter((id) => id !== bank.id) : [...draft.hiddenIds, bank.id] })}
                      />
                      {bank.name}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ───────────────────────── Switch ─────────────────────────

const MODE_TEXT = {
  SEQUENTIAL: ["Sequential", "Each click moves to the next option in the list, and after the last one it starts again from the first."],
  CUSTOM: ["Custom order", "You choose which options the switch uses and the exact order it follows."],
} as const;

export function SwitchSection({
  settings,
  options,
  banks,
  actions,
  onSaved,
}: {
  settings: SwitchAllSettings;
  options: Pick<QuickPayOptions, "persons">;
  banks: readonly BankOption[];
  actions: SettingsFormActions;
  onSaved: OnSaved;
}) {
  const { draft, setDraft, saving, error, dirty, save, reset } = useSection("switch", settings, actions, onSaved);

  // The choices each switch can move through. Credit History changes every time, so it has no list to arrange.
  const choices: Record<SwitchFeature, { id: string; label: string }[]> = {
    bank: banks.map((b) => ({ id: b.id, label: b.label })),
    split: options.persons.map((p) => ({ id: p.id, label: p.name })),
    credit: [],
  };

  const update = (feature: SwitchFeature, patch: Partial<SwitchAllSettings[SwitchFeature]>) => setDraft({ ...draft, [feature]: { ...draft[feature], ...patch } });

  return (
    <SectionCard
      title="Switch Settings"
      description="The switch icon (⇄) beside a dropdown moves to the next option with one click. Choose where it is used, and how it moves."
      footer={<SaveBar dirty={dirty} saving={saving} error={error} onSave={save} onReset={reset} />}
    >
      <div className="space-y-5">
        {SWITCH_FEATURES.map((feature) => {
          const cfg = draft[feature];
          const list = choices[feature];
          const label = (id: string) => list.find((c) => c.id === id)?.label ?? id;
          const inOrder = cfg.order.filter((id) => list.some((c) => c.id === id));
          const notInOrder = list.filter((c) => !inOrder.includes(c.id));
          const startChoices = cfg.mode === "CUSTOM" ? inOrder.map((id) => ({ id, label: label(id) })) : list;
          const custom = cfg.mode === "CUSTOM" && feature !== "credit";

          return (
            <fieldset key={feature} className="space-y-3 rounded-xl border p-4">
              <legend className="px-1 text-sm font-semibold">{SWITCH_LABEL[feature]}</legend>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox checked={cfg.enabled} onCheckedChange={(v) => update(feature, { enabled: v === true })} />
                Show the switch icon here
              </label>

              {cfg.enabled ? (
                <>
                  {feature === "credit" ? (
                    <p className="text-xs text-muted-foreground">Credit History lists your latest credits, which change every time, so the switch simply moves to the next credit in the list.</p>
                  ) : (
                    <div role="radiogroup" aria-label={`${SWITCH_LABEL[feature]} switch mode`} className="grid gap-2 sm:grid-cols-2">
                      {(["SEQUENTIAL", "CUSTOM"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          role="radio"
                          aria-checked={cfg.mode === mode}
                          onClick={() => update(feature, { mode, order: mode === "CUSTOM" && cfg.order.length === 0 ? list.map((c) => c.id) : cfg.order })}
                          className={cn("rounded-xl border p-3 text-left", cfg.mode === mode ? "border-neutral-950 bg-neutral-50" : "hover:bg-muted/50")}
                        >
                          <p className="text-sm font-semibold">{MODE_TEXT[mode][0]}</p>
                          <p className="text-xs text-muted-foreground">{MODE_TEXT[mode][1]}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {custom ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">Order the switch follows</p>
                      <SortableList
                        items={inOrder.map((id) => ({ id, label: label(id) }))}
                        onChange={(order) => update(feature, { order })}
                        onRemove={(id) => update(feature, { order: cfg.order.filter((x) => x !== id), startId: cfg.startId === id ? null : cfg.startId })}
                        emptyText="Add at least one option below."
                      />
                      {notInOrder.length > 0 ? (
                        <select
                          aria-label={`Add an option to the ${SWITCH_LABEL[feature]} switch`}
                          value=""
                          onChange={(e) => e.target.value && update(feature, { order: [...inOrder, e.target.value] })}
                          className="h-9 max-w-xs rounded-lg border border-input bg-background px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
                        >
                          <option value="">Add an option…</option>
                          {notInOrder.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  ) : null}

                  {feature !== "credit" ? (
                    <div className="space-y-1">
                      <label htmlFor={`switch-start-${feature}`} className="text-xs font-semibold text-muted-foreground">
                        Starts with
                      </label>
                      <select
                        id={`switch-start-${feature}`}
                        value={cfg.startId && startChoices.some((c) => c.id === cfg.startId) ? cfg.startId : ""}
                        onChange={(e) => update(feature, { startId: e.target.value || null })}
                        className="block h-9 max-w-xs rounded-lg border border-input bg-background px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
                      >
                        <option value="">First in the list</option>
                        {startChoices.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">Where the first click lands when nothing is chosen yet.</p>
                    </div>
                  ) : null}
                </>
              ) : null}
            </fieldset>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ───────────────────────── Debt ─────────────────────────

export function DebtSection({ settings, options, percentOptions, actions, onSaved }: { settings: DebtSettings; options: Pick<QuickPayOptions, "persons">; percentOptions: readonly number[]; actions: SettingsFormActions; onSaved: OnSaved }) {
  const { draft, setDraft, saving, error, dirty, save, reset } = useSection("debt", settings, actions, onSaved);
  const percents = [...new Set([...percentOptions, 100, draft.defaultPercent])].sort((a, b) => a - b);

  return (
    <SectionCard
      title="Debt Settings"
      description="How the Debt Management page looks, who it lists, and how a Debt starts in Quick Entry. The page follows these settings as soon as you save."
      footer={<SaveBar dirty={dirty} saving={saving} error={error} onSave={save} onReset={reset} />}
    >
      <div className="space-y-2">
        <p className="text-sm font-semibold">Columns shown</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {DEBT_COLUMNS.map((column) => (
            <label key={column} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={draft.columns[column]} onCheckedChange={(v) => setDraft({ ...draft, columns: { ...draft.columns, [column]: v === true } })} />
              {DEBT_COLUMN_LABEL[column]}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Display</p>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={draft.showTotals} onCheckedChange={(v) => setDraft({ ...draft, showTotals: v === true })} />
          Show the totals above the table (Total split, Total paid, Total remaining)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={draft.hideSettled} onCheckedChange={(v) => setDraft({ ...draft, hideSettled: v === true })} />
          Hide people who are settled (nothing remaining)
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">People shown in Debt Management and offered for a Debt</p>
        {options.persons.length === 0 ? (
          <p className="text-xs text-muted-foreground">No people yet. Add them in the Split tab.</p>
        ) : (
          <ul className="flex flex-wrap gap-x-6 gap-y-2" aria-label="People in Debt">
            {options.persons.map((person) => (
              <li key={person.id}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={!draft.hiddenPersonIds.includes(person.id)}
                    onCheckedChange={(v) => setDraft({ ...draft, hiddenPersonIds: v === true ? draft.hiddenPersonIds.filter((id) => id !== person.id) : [...draft.hiddenPersonIds, person.id] })}
                  />
                  {person.name}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="debt-default-percent" className="text-sm font-semibold">
          Default percentage for a Debt
        </label>
        <select
          id="debt-default-percent"
          value={String(draft.defaultPercent)}
          onChange={(e) => setDraft({ ...draft, defaultPercent: Number(e.target.value) })}
          className="block h-10 w-40 rounded-lg border border-input bg-background px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
        >
          {percents.map((p) => (
            <option key={p} value={String(p)}>
              {formatPercent(p)}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">What a single person starts at when Debt is ticked (100% means they owe the whole amount). Several people divide it equally.</p>
      </div>
    </SectionCard>
  );
}
