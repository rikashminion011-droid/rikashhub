"use client";

import { Banknote, ArrowLeftRight, HandCoins, ListChecks, Settings2, Soup, Tags, UsersRound, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FoodSettingsActions } from "@/features/food/components/food-settings";
import { FoodSettings } from "@/features/food/components/food-settings";
import type { FoodPricing } from "@/features/food/types";
import { METHOD_KINDS, type MethodKind } from "@/features/expenses/types";
import type { UserActions } from "@/features/users/actions";
import { PeopleManager } from "@/features/users/components/people-manager";
import type { PersonRow } from "@/features/users/types";
import { cn } from "@/lib/utils";
import type { addBankAction, addCategoryAction, addSubBankAction, addSubCategoryAction, removeBankAction, removeCategoryAction, renameBankAction, renameCategoryAction, setKeywordsAction } from "../actions";
import type { QuickPaySettingsData } from "../settings-model";
import { SETTINGS_PAGES, type SettingsPage, type SettingsTab } from "../settings-tabs";
import type { BankOption, BankTreeNode, CategoryTreeNode, QuickPayOptions } from "../types";
import { KeywordEditor } from "./keyword-editor";
import { BankVisibilitySection, DebtSection, DefaultChoice, SwitchSection } from "./settings-quick-entry";
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
  food: FoodSettingsActions;
}

const SECTIONS: { id: SettingsTab; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "categories", label: "Categories", hint: "Reasons and their category", icon: Tags },
  { id: "banks", label: "Bank Through", hint: "Banks and the default", icon: Banknote },
  { id: "switch", label: "Switch", hint: "The ⇄ icon beside dropdowns", icon: ArrowLeftRight },
  { id: "split", label: "Split", hint: "People, percentages, fields", icon: UsersRound },
  { id: "debt", label: "Debt", hint: "Debt Management page", icon: HandCoins },
  { id: "food", label: "Food Entry", hint: "Items and prices", icon: Soup },
  { id: "general", label: "General", hint: "Labels, defaults, credit history", icon: Settings2 },
];

const kindLabel = (kind: MethodKind) => METHOD_KINDS.find((k) => k.value === kind)?.label ?? "Other";
const bankNodes = (tree: BankTreeNode[]): TreeNode[] => tree.map((n) => ({ id: n.id, name: n.name, children: n.accounts, badge: kindLabel(n.kind) }));
const categoryNodes = (tree: CategoryTreeNode[]): TreeNode[] => tree.map((n) => ({ id: n.id, name: n.name, children: n.subs }));

/** The banks you can pick: a main file without accounts, or each account under one (as "GPay → HDFC"). */
const leavesOf = (tree: BankTreeNode[]): BankOption[] =>
  tree.flatMap((main) => (main.accounts.length === 0 ? [{ id: main.id, label: main.name, mainName: main.name, name: main.name }] : main.accounts.map((a) => ({ id: a.id, label: `${main.name} → ${a.name}`, mainName: main.name, name: a.name }))));

/**
 * Customized Settings: choose a page at the top, then one section at a time. Quick Entry has Categories, Bank Through, Switch,
 * Split, Debt and Food Entry (and General for labels and Credit History). Everything saved here is used by Quick Entry,
 * the edit pop-up, Add Bulk and Debt Management straight away. The other pages are listed for later.
 */
export function SettingsCenter({
  initialTab,
  banks: initialBanks,
  categories: initialCategories,
  people,
  options,
  food,
  actions,
}: {
  initialTab: SettingsTab;
  banks: BankTreeNode[];
  categories: CategoryTreeNode[];
  people: PersonRow[];
  options: QuickPayOptions;
  food: FoodPricing;
  actions: SettingsActions;
}) {
  const [page, setPage] = useState<SettingsPage>("quick-entry");
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [bankTree, setBankTree] = useState(initialBanks);
  const [categories, setCategories] = useState(initialCategories);
  const [settings, setSettings] = useState<QuickPaySettingsData>(options.settings);
  const [newKind, setNewKind] = useState<MethodKind>("BANK");

  function choose(next: SettingsTab) {
    setTab(next);
    window.history.replaceState(null, "", `?tab=${next}`);
  }

  /** Category changes made in the names list also refresh the keyword list. */
  function trackCategories(result: { ok: true; tree: CategoryTreeNode[] } | { ok: false; error: string }): TreeResult {
    if (!result.ok) return { ok: false, error: result.error };
    setCategories(result.tree);
    return { ok: true, nodes: categoryNodes(result.tree) };
  }
  function bankResult(result: { ok: true; tree: BankTreeNode[] } | { ok: false; error: string }): TreeResult {
    if (!result.ok) return { ok: false, error: result.error };
    setBankTree(result.tree);
    return { ok: true, nodes: bankNodes(result.tree) };
  }

  // The sections read these (banks and categories may have changed), with the saved settings merged in.
  const bankOptions = leavesOf(bankTree);
  const categoryOptions = categories.flatMap((m) => [
    { id: m.id, label: m.name, mainName: m.name, name: m.name, isSub: false },
    ...m.subs.map((s) => ({ id: s.id, label: `${m.name} → ${s.name}`, mainName: m.name, name: s.name, isSub: true })),
  ]);
  const liveOptions: QuickPayOptions = { ...options, settings, banks: bankOptions, categories: categoryOptions };

  return (
    <div className="space-y-5">
      {/* Which page is being customized */}
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="settings-page" className="text-sm font-semibold">
          Customize
        </label>
        <select
          id="settings-page"
          value={page}
          onChange={(e) => setPage(e.target.value as SettingsPage)}
          className="h-10 min-w-56 rounded-lg border border-input bg-background px-3 text-base font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
        >
          {SETTINGS_PAGES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {p.id === "quick-entry" ? " (default)" : ""}
            </option>
          ))}
        </select>
      </div>

      {page !== "quick-entry" ? (
        <Card>
          <CardHeader>
            <CardTitle>{SETTINGS_PAGES.find((p) => p.id === page)?.label}</CardTitle>
            <CardDescription>Customization for this page is not set up yet. Its options will appear here.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {/* Sections, as horizontal tabs */}
          <nav aria-label="Quick Entry settings sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul role="tablist" className="flex w-max gap-1.5 rounded-xl bg-muted p-1 sm:w-fit">
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <li key={id} className="shrink-0">
                  <button
                    type="button"
                    role="tab"
                    id={`tab-${id}`}
                    aria-selected={tab === id}
                    aria-controls="settings-panel"
                    onClick={() => choose(id)}
                    className={cn(
                      "flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                      tab === id ? "bg-neutral-950 text-white shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div id="settings-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-w-0 max-w-3xl space-y-4">
            {tab === "categories" ? (
              <>
                <Card className="overflow-visible">
                  <CardHeader>
                    <CardTitle>Categories</CardTitle>
                    <CardDescription>Add as many categories as you like, for example Food, Travel, Office. Give each its reasons below. The first three are shown; use See more for the rest.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <DefaultChoice kind="category" settings={settings.fields} options={liveOptions} actions={actions} onSaved={setSettings} />
                    <TreeEditor
                      key="categories"
                      initialVisible={3}
                      allowSubs={false}
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
                      <ListChecks className="size-4" aria-hidden /> Reasons
                    </CardTitle>
                    <CardDescription>
                      When one of these reasons is typed in Quick Entry, its category is selected automatically (typing Tiffin selects Food). If nothing matches you choose the category yourself, and a category you choose is never replaced.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <KeywordEditor tree={categories} setKeywords={actions.setKeywords} onTree={setCategories} initialVisible={3} mainOnly />
                  </CardContent>
                </Card>
              </>
            ) : null}

            {tab === "banks" ? (
              <>
                <Card className="overflow-visible">
                  <CardHeader>
                    <CardTitle>Bank Through</CardTitle>
                    <CardDescription>Main bank names and the sub-banks under them, for example GPay → HDFC, SBI, ICICI. Add, rename or delete them; every dropdown updates as soon as you do.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <DefaultChoice kind="bank" settings={settings.fields} options={liveOptions} actions={actions} onSaved={setSettings} />
                    <TreeEditor
                      key="banks"
                      initialNodes={bankNodes(bankTree)}
                      nouns={{ main: "main bank", sub: "sub-bank" }}
                      actions={{
                        addMain: async (name) => bankResult(await actions.addBank({ name, kind: newKind })),
                        addSub: async (mainId, name) => bankResult(await actions.addSubBank({ mainId, name })),
                        rename: async (id, name) => bankResult(await actions.renameBank({ id, name })),
                        remove: async (id) => bankResult(await actions.removeBank({ id })),
                      }}
                      mainExtra={
                        <div role="radiogroup" aria-label="Type of the new main bank" className="flex flex-wrap items-center gap-2 text-xs">
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
                <BankVisibilitySection key={bankOptions.map((b) => b.id).join(",")} settings={settings.banks} banks={bankOptions} actions={actions} onSaved={setSettings} />
              </>
            ) : null}

            {tab === "switch" ? <SwitchSection key={bankOptions.length} settings={settings.switch} options={liveOptions} banks={bankOptions} actions={actions} onSaved={setSettings} /> : null}

            {tab === "split" ? (
              <>
                <PeopleManager initialPeople={people} actions={actions.people} />
                <SplitSection settings={settings.split} options={liveOptions} actions={actions} onSaved={setSettings} />
              </>
            ) : null}

            {tab === "debt" ? <DebtSection settings={settings.debt} options={liveOptions} percentOptions={settings.split.percentOptions} actions={actions} onSaved={setSettings} /> : null}

            {tab === "food" ? (
              <>
                <p className="text-sm text-muted-foreground">Add food items under Tiffin, Lunch and Dinner with their own prices, and set each meal&apos;s default price. Food Entry and Monthly Food Tracking use them straight away: choosing Fish Gravy under Lunch fills in its price, and anything else uses the meal&apos;s default.</p>
                <FoodSettings initial={food} actions={actions.food} />
              </>
            ) : null}

            {tab === "general" ? (
              <>
                <FieldsSection settings={settings.fields} options={liveOptions} actions={actions} onSaved={setSettings} />
                <CreditsSection settings={settings.credits} actions={actions} onSaved={setSettings} />
              </>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
