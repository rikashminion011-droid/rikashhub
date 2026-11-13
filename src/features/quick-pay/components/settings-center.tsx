"use client";

import { Coins, Landmark, ListChecks, Percent, SlidersHorizontal, Tags, UsersRound, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { METHOD_KINDS, type MethodKind } from "@/features/expenses/types";
import type { UserActions } from "@/features/users/actions";
import { PeopleManager } from "@/features/users/components/people-manager";
import type { PersonRow } from "@/features/users/types";
import { cn } from "@/lib/utils";
import type { addBankAction, addCategoryAction, addSubBankAction, addSubCategoryAction, removeBankAction, removeCategoryAction, renameBankAction, renameCategoryAction, setKeywordsAction } from "../actions";
import type { QuickPaySettingsData } from "../settings-model";
import type { SettingsTab } from "../settings-tabs";
import type { BankTreeNode, CategoryTreeNode, QuickPayOptions } from "../types";
import { KeywordEditor } from "./keyword-editor";
import { CreditsSection, FieldsSection, SplitSection, type SettingsFormActions } from "./settings-sections";
import { TreeEditor, type TreeNode, type TreeResult } from "./tree-editor";

export interface SettingsActions extends SettingsFormActions {
  addBank: typeof addBankAction;
  addSubBank: typeof addSubBankAction;
  renameBank: typeof renameBankAction;
  removeBank: typeof removeBankAction;
  addCategory: typeof addCategoryAction;
  addSubCategory: typeof addSubCategoryAction;
  renameCategory: typeof renameCategoryAction;
  removeCategory: typeof removeCategoryAction;
  setKeywords: typeof setKeywordsAction;
  people: Pick<UserActions, "addPerson" | "renamePerson" | "removePerson">;
}

const SECTIONS: { id: SettingsTab; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "users", label: "Users", hint: "People for Split and Debt", icon: UsersRound },
  { id: "banks", label: "Bank Details", hint: "Main files and accounts", icon: Landmark },
  { id: "categories", label: "Categories & Keywords", hint: "Reason → category", icon: Tags },
  { id: "fields", label: "Fields & Defaults", hint: "Labels, default selections", icon: SlidersHorizontal },
  { id: "split", label: "Split", hint: "Percentages and defaults", icon: Percent },
  { id: "credits", label: "Credits Added", hint: "What the panel shows", icon: Coins },
];

const kindLabel = (kind: MethodKind) => METHOD_KINDS.find((k) => k.value === kind)?.label ?? "Other";
const bankNodes = (tree: BankTreeNode[]): TreeNode[] => tree.map((n) => ({ id: n.id, name: n.name, children: n.accounts, badge: kindLabel(n.kind) }));
const categoryNodes = (tree: CategoryTreeNode[]): TreeNode[] => tree.map((n) => ({ id: n.id, name: n.name, children: n.subs }));

/**
 * Customized Settings: one page, with each kind of configuration in its own section. Everything saved here is used by
 * Quick Entry, the edit pop-up, GPay Transactions, Add Bulk and Debt Management straight away.
 */
export function SettingsCenter({
  initialTab,
  banks,
  categories: initialCategories,
  people,
  options,
  actions,
}: {
  initialTab: SettingsTab;
  banks: BankTreeNode[];
  categories: CategoryTreeNode[];
  people: PersonRow[];
  options: QuickPayOptions;
  actions: SettingsActions;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [categories, setCategories] = useState(initialCategories);
  const [settings, setSettings] = useState<QuickPaySettingsData>(options.settings);
  const [newKind, setNewKind] = useState<MethodKind>("BANK");

  function choose(next: SettingsTab) {
    setTab(next);
    window.history.replaceState(null, "", `?tab=${next}`);
  }

  /** Category changes made in the names list also refresh the keyword list below it. */
  function trackCategories(result: { ok: true; tree: CategoryTreeNode[] } | { ok: false; error: string }): TreeResult {
    if (!result.ok) return { ok: false, error: result.error };
    setCategories(result.tree);
    return { ok: true, nodes: categoryNodes(result.tree) };
  }
  const bankResult = (result: { ok: true; tree: BankTreeNode[] } | { ok: false; error: string }): TreeResult => (result.ok ? { ok: true, nodes: bankNodes(result.tree) } : { ok: false, error: result.error });

  // The sections read these (banks and people may have changed), with the saved settings merged in.
  const liveOptions: QuickPayOptions = { ...options, settings, categories: options.categories };

  return (
    <div className="grid items-start gap-5 md:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul role="tablist" className="flex gap-1.5 md:flex-col">
          {SECTIONS.map(({ id, label, hint, icon: Icon }) => (
            <li key={id} className="shrink-0">
              <button
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={tab === id}
                aria-controls="settings-panel"
                onClick={() => choose(id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  tab === id ? "border-neutral-950 bg-neutral-950 text-white" : "bg-card hover:bg-muted",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="block whitespace-nowrap">{label}</span>
                  <span className={cn("hidden text-xs font-normal md:block", tab === id ? "text-white/70" : "text-muted-foreground")}>{hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div id="settings-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-w-0 space-y-4">
        {tab === "users" ? (
          <>
            <PeopleManager initialPeople={people} actions={actions.people} />
            <p className="text-xs text-muted-foreground">
              These people are offered wherever you pick a person: Split in Quick Entry and the GPay Transactions table. Each person&apos;s split share, payments and what remains are tracked in Debt Management.
            </p>
          </>
        ) : null}

        {tab === "banks" ? (
          <Card>
            <CardHeader>
              <CardTitle>Bank Details</CardTitle>
              <CardDescription>Main files and the accounts under them, for example GPay → HDFC, SBI, ICICI. Add, rename or delete them; every Bank Through dropdown updates as soon as you do.</CardDescription>
            </CardHeader>
            <CardContent>
              <TreeEditor
                key="banks"
                initialNodes={bankNodes(banks)}
                nouns={{ main: "main file", sub: "account" }}
                actions={{
                  addMain: async (name) => bankResult(await actions.addBank({ name, kind: newKind })),
                  addSub: async (mainId, name) => bankResult(await actions.addSubBank({ mainId, name })),
                  rename: async (id, name) => bankResult(await actions.renameBank({ id, name })),
                  remove: async (id) => bankResult(await actions.removeBank({ id })),
                }}
                mainExtra={
                  <div role="radiogroup" aria-label="Type of the new main file" className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Type:</span>
                    {METHOD_KINDS.map((k) => (
                      <button
                        key={k.value}
                        type="button"
                        role="radio"
                        aria-checked={newKind === k.value}
                        onClick={() => setNewKind(k.value)}
                        className={cn("h-7 rounded-full border px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50", newKind === k.value ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}
                      >
                        {k.label}
                      </button>
                    ))}
                  </div>
                }
              />
            </CardContent>
          </Card>
        ) : null}

        {tab === "categories" ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Categories</CardTitle>
                <CardDescription>Main categories and sub-categories, for example Food → Dosa, Idli, Tiffin; Travel → Petrol, Rapido, Porter.</CardDescription>
              </CardHeader>
              <CardContent>
                <TreeEditor
                  key="categories"
                  initialNodes={categoryNodes(categories)}
                  nouns={{ main: "category", sub: "sub-category" }}
                  actions={{
                    addMain: async (name) => trackCategories(await actions.addCategory({ name })),
                    addSub: async (mainId, name) => trackCategories(await actions.addSubCategory({ mainId, name })),
                    rename: async (id, name) => trackCategories(await actions.renameCategory({ id, name })),
                    remove: async (id) => trackCategories(await actions.removeCategory({ id })),
                  }}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListChecks className="size-4" aria-hidden /> Reason keywords
                </CardTitle>
                <CardDescription>
                  When a keyword appears in the Reason in Quick Entry, its category is selected automatically. If nothing matches you choose the category yourself, and a category you choose is never replaced.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <KeywordEditor tree={categories} setKeywords={actions.setKeywords} onTree={setCategories} />
              </CardContent>
            </Card>
          </>
        ) : null}

        {tab === "fields" ? <FieldsSection settings={settings.fields} options={liveOptions} actions={actions} onSaved={setSettings} /> : null}
        {tab === "split" ? <SplitSection settings={settings.split} options={liveOptions} actions={actions} onSaved={setSettings} /> : null}
        {tab === "credits" ? <CreditsSection settings={settings.credits} actions={actions} onSaved={setSettings} /> : null}
      </div>
    </div>
  );
}
