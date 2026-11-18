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
import { sharedCategories } from "../availability";
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
  creditCategories: initialCreditCategories,
  people,
  options,
  gpaySettings,
  food,
  actions,
}: {
  initialTab: SettingsTab;
  banks: BankTreeNode[];
  categories: CategoryTreeNode[];
  /** The categories for a Credit (money in), a separate list from the Debit ones. */
  creditCategories: CategoryTreeNode[];
  people: PersonRow[];
  options: QuickPayOptions;
  /** The settings GPay Transactions uses (its own, following Quick Entry where none were set). */
  gpaySettings: QuickPaySettingsData;
  food: FoodPricing;
  actions: SettingsActions;
}) {
  const [page, setPage] = useState<SettingsPage>("quick-entry");
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [bankTree, setBankTree] = useState(initialBanks);
  const [categories, setCategories] = useState(initialCategories);
  const [creditTree, setCreditTree] = useState(initialCreditCategories);
  // Which list of categories is open: a Debit has one set, a Credit another.
  const [catKind, setCatKind] = useState<"DEBIT" | "CREDIT">("DEBIT");
  // Quick Entry and GPay Transactions each have their own settings; the page chosen above decides which are shown and saved.
  const [quickSettings, setQuickSettings] = useState<QuickPaySettingsData>(options.settings);
  const [gpayOwn, setGpayOwn] = useState<QuickPaySettingsData>(gpaySettings);
  const scope = page === "gpay" ? "gpay" : "quick-entry";
  const settings = scope === "gpay" ? gpayOwn : quickSettings;
  const setSettings = scope === "gpay" ? setGpayOwn : setQuickSettings;
  // Saving and resetting go to the settings of the chosen page.
  const scoped: SettingsActions = { ...actions, save: (raw) => actions.save({ ...(raw as object), scope }), reset: (raw) => actions.reset({ ...(raw as object), scope }) };
  const [newKind, setNewKind] = useState<MethodKind>("BANK");

  function choose(next: SettingsTab) {
    setTab(next);
    window.history.replaceState(null, "", `?tab=${next}`);
  }

  /** Category changes made in the names list also refresh the keyword list. */
  function trackCategories(result: { ok: true; tree: CategoryTreeNode[] } | { ok: false; error: string }): TreeResult {
    if (!result.ok) return { ok: false, error: result.error };
    (catKind === "CREDIT" ? setCreditTree : setCategories)(result.tree);
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
  const toOptions = (tree: CategoryTreeNode[]) =>
    tree.flatMap((m) => [
      { id: m.id, label: m.name, mainName: m.name, name: m.name, isSub: false },
      ...m.subs.map((s) => ({ id: s.id, label: `${m.name} → ${s.name}`, mainName: m.name, name: s.name, isSub: true })),
    ]);
  // A Debit and a Credit share one list of categories (the Debit and Credit tabs below still manage them separately).
  const sharedOptions = sharedCategories(categoryOptions, toOptions(creditTree));
  const liveOptions: QuickPayOptions = { ...options, settings, banks: bankOptions, categories: sharedOptions, creditCategories: sharedOptions };
  const shownTree = catKind === "CREDIT" ? creditTree : categories;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
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

      {page !== "quick-entry" && page !== "gpay" ? (
        <PageSettingsCard
          page={page}
          onOpenDebt={() => {
            setPage("quick-entry");
            choose("debt");
          }}
        />
      ) : (
        <>
          {page === "gpay" ? (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">These settings are for GPay Transactions, its edit pop-up and its Add Bulk only; Quick Entry is not changed. A section you have not changed here follows Quick Entry. Categories and the bank list themselves are shared by every page.</p>
          ) : null}
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
                      tab === id ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div key={scope} id="settings-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-w-0 max-w-3xl space-y-4">
            {tab === "categories" ? (
              <>
                {/* A Debit (money out) and a Credit (money in) have different categories */}
                <div role="radiogroup" aria-label="Which categories" className="flex w-fit gap-1 rounded-xl bg-muted p-1">
                  {(
                    [
                      ["DEBIT", "Debit categories"],
                      ["CREDIT", "Credit categories"],
                    ] as const
                  ).map(([kind, label]) => (
                    <button
                      key={kind}
                      type="button"
                      role="radio"
                      aria-checked={catKind === kind}
                      onClick={() => setCatKind(kind)}
                      className={cn("h-9 rounded-lg px-4 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50", catKind === kind ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <Card className="overflow-visible">
                  <CardHeader>
                    <CardTitle>{catKind === "CREDIT" ? "Credit categories" : "Debit categories"}</CardTitle>
                    <CardDescription>
                      {catKind === "CREDIT"
                        ? "The categories offered when an entry is a Credit (money in), for example Salary, Refund, Interest. They are separate from the Debit categories. The first three are shown; use See more for the rest."
                        : "The categories offered when an entry is a Debit (money out), for example Food, Travel, Office. They are separate from the Credit categories. The first three are shown; use See more for the rest."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {catKind === "DEBIT" ? <DefaultChoice kind="category" settings={settings.fields} options={liveOptions} actions={scoped} onSaved={setSettings} /> : null}
                    <TreeEditor
                      key={`categories-${catKind}`}
                      initialVisible={3}
                      allowSubs={false}
                      initialNodes={categoryNodes(shownTree)}
                      nouns={{ main: "category", sub: "sub-category" }}
                      actions={{
                        addMain: async (name) => trackCategories(await actions.addCategory({ name, kind: catKind })),
                        addSub: async (mainId, name) => trackCategories(await actions.addSubCategory({ mainId, name })),
                        rename: async (id, name) => trackCategories(await actions.renameCategory({ id, name, kind: catKind })),
                        remove: async (id) => trackCategories(await actions.removeCategory({ id, kind: catKind })),
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
                    <KeywordEditor
                      key={`reasons-${catKind}`}
                      tree={shownTree}
                      setKeywords={((raw: object) => actions.setKeywords({ ...raw, kind: catKind })) as typeof actions.setKeywords}
                      onTree={catKind === "CREDIT" ? setCreditTree : setCategories}
                      initialVisible={3}
                      mainOnly
                    />
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
                    <DefaultChoice kind="bank" settings={settings.fields} options={liveOptions} actions={scoped} onSaved={setSettings} />
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
                <BankVisibilitySection target={scope === "gpay" ? "GPay Transactions" : "Quick Entry"} key={bankOptions.map((b) => b.id).join(",")} settings={settings.banks} banks={bankOptions} actions={scoped} onSaved={setSettings} />
              </>
            ) : null}

            {tab === "switch" ? <SwitchSection key={bankOptions.length} settings={settings.switch} options={liveOptions} banks={bankOptions} actions={scoped} onSaved={setSettings} /> : null}

            {tab === "split" ? (
              <>
                <PeopleManager initialPeople={people} actions={actions.people} />
                <SplitSection settings={settings.split} options={liveOptions} actions={scoped} onSaved={setSettings} />
              </>
            ) : null}

            {tab === "debt" ? <DebtSection settings={settings.debt} options={liveOptions} percentOptions={settings.split.percentOptions} actions={scoped} onSaved={setSettings} /> : null}

            {tab === "food" ? (
              <>
                <p className="text-sm text-muted-foreground">Add food items under Tiffin, Lunch and Dinner with their own prices, and set each meal&apos;s default price. Food Entry and Monthly Food Tracking use them straight away: choosing Fish Gravy under Lunch fills in its price, and anything else uses the meal&apos;s default.</p>
                <FoodSettings initial={food} actions={actions.food} />
              </>
            ) : null}

            {tab === "general" ? (
              <>
                <FieldsSection settings={settings.fields} options={liveOptions} actions={scoped} onSaved={setSettings} />
                <CreditsSection settings={settings.credits} actions={scoped} onSaved={setSettings} />
              </>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

const PAGE_NOTES: Record<string, { text: string; links: { href: string; label: string }[] }> = {
  food: { text: "Food items, their prices and the default price of Tiffin, Lunch and Dinner. A typed word finds an item by part of its name (Fish finds Fish Gravy).", links: [{ href: "/food/settings", label: "Open food items and prices" }] },
  shopping: { text: "Shopping platforms (D Mart, AB Supermarket and any you add). Choose a platform on the Shopping Records page, then use its menu to rename or delete it, or pick + New Shopping Platform. Each one appears in Quick Entry under Shopping Portals.", links: [{ href: "/shopping", label: "Open Shopping Records" }] },
  "credit-portal": { text: "Credit portals (HDFC, Slice, Amazon Pay Later, Flipkart Pay Later and any you add), with their card information. Use the portal list and Card Information on the Credit Portal page.", links: [{ href: "/credit-cards", label: "Open Credit Portal" }] },
  "monthly-due": { text: "Which person in your list is you: everything recorded for that person is counted in My Due. Monthly expenses (Room Rent and others) are typed on the Monthly Due page for each month.", links: [{ href: "/monthly-due", label: "Open Monthly Due" }] },
  dashboard: { text: "The Dashboard has no options of its own yet. It follows the month or dates you choose and the settings of the other pages.", links: [{ href: "/dashboard", label: "Open Dashboard" }] },
};

/** Pages whose settings live on the page itself: what they are, and a link straight there. Debt Management opens its own section here. */
function PageSettingsCard({ page, onOpenDebt }: { page: SettingsPage; onOpenDebt: () => void }) {
  const title = SETTINGS_PAGES.find((p) => p.id === page)?.label;
  if (page === "debt") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Which columns show, which people are listed, whether settled people are hidden and the default debt percentage. The Debt section is shared with Quick Entry.</CardDescription>
        </CardHeader>
        <CardContent>
          <button type="button" onClick={onOpenDebt} className="text-sm font-medium underline underline-offset-4">
            Open the Debt section
          </button>
        </CardContent>
      </Card>
    );
  }
  const note = PAGE_NOTES[page];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{note?.text ?? "Nothing to set up here yet."}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-4">
        {note?.links.map((l) => (
          <a key={l.href} href={l.href} className="text-sm font-medium underline underline-offset-4">
            {l.label}
          </a>
        ))}
      </CardContent>
    </Card>
  );
}
