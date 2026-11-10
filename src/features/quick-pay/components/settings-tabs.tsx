"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { METHOD_KINDS, type MethodKind } from "@/features/expenses/types";
import { cn } from "@/lib/utils";
import type { addBankAction, addCategoryAction, addSubBankAction, addSubCategoryAction, removeBankAction, removeCategoryAction, renameBankAction, renameCategoryAction } from "../actions";
import type { BankTreeNode, CategoryTreeNode } from "../types";
import { TreeEditor, type TreeNode, type TreeResult } from "./tree-editor";

export interface SettingsActions {
  addBank: typeof addBankAction;
  addSubBank: typeof addSubBankAction;
  renameBank: typeof renameBankAction;
  removeBank: typeof removeBankAction;
  addCategory: typeof addCategoryAction;
  addSubCategory: typeof addSubCategoryAction;
  renameCategory: typeof renameCategoryAction;
  removeCategory: typeof removeCategoryAction;
}

const kindLabel = (kind: MethodKind) => METHOD_KINDS.find((k) => k.value === kind)?.label ?? "Other";

const bankNodes = (tree: BankTreeNode[]): TreeNode[] => tree.map((n) => ({ id: n.id, name: n.name, children: n.accounts, badge: kindLabel(n.kind) }));
const categoryNodes = (tree: CategoryTreeNode[]): TreeNode[] => tree.map((n) => ({ id: n.id, name: n.name, children: n.subs }));

function wrap<T>(result: { ok: true; tree: T[] } | { ok: false; error: string }, toNodes: (tree: T[]) => TreeNode[]): TreeResult {
  return result.ok ? { ok: true, nodes: toNodes(result.tree) } : { ok: false, error: result.error };
}

/** "Customized Settings": the bank details and the category tree used by Quick Entry and Add Bulk. */
export function SettingsTabs({
  initialTab,
  banks,
  categories,
  actions,
}: {
  initialTab: "banks" | "categories";
  banks: BankTreeNode[];
  categories: CategoryTreeNode[];
  actions: SettingsActions;
}) {
  const [tab, setTab] = useState(initialTab);
  // The kind chosen for the next main bank (the add form is inside the editor, so the choice lives here).
  const [newKind, setNewKind] = useState<MethodKind>("BANK");

  const tabs = [
    { id: "banks" as const, label: "Bank Details" },
    { id: "categories" as const, label: "Categories" },
  ];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Settings" className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => {
              setTab(t.id);
              window.history.replaceState(null, "", `?tab=${t.id}`);
            }}
            className={cn(
              "h-8 rounded-md px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              tab === t.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "banks" ? (
        <Card role="tabpanel" id="panel-banks" aria-labelledby="tab-banks">
          <CardHeader>
            <CardTitle>Bank Details</CardTitle>
            <CardDescription>
              Main files and the accounts under them, for example GPay → HDFC, SBI, ICICI. They appear in the Bank Through dropdown as soon as you add them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TreeEditor
              key="banks"
              initialNodes={bankNodes(banks)}
              nouns={{ main: "main file", sub: "account" }}
              actions={{
                addMain: async (name) => wrap(await actions.addBank({ name, kind: newKind }), bankNodes),
                addSub: async (mainId, name) => wrap(await actions.addSubBank({ mainId, name }), bankNodes),
                rename: async (id, name) => wrap(await actions.renameBank({ id, name }), bankNodes),
                remove: async (id) => wrap(await actions.removeBank({ id }), bankNodes),
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
                      className={cn(
                        "h-7 rounded-full border px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        newKind === k.value ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
                      )}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card role="tabpanel" id="panel-categories" aria-labelledby="tab-categories">
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>
              Main categories and sub-categories, for example Food → Dosa, Idli, Tiffin; Travel → Petrol, Rapido, Porter.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TreeEditor
              key="categories"
              initialNodes={categoryNodes(categories)}
              nouns={{ main: "category", sub: "sub-category" }}
              actions={{
                addMain: async (name) => wrap(await actions.addCategory({ name }), categoryNodes),
                addSub: async (mainId, name) => wrap(await actions.addSubCategory({ mainId, name }), categoryNodes),
                rename: async (id, name) => wrap(await actions.renameCategory({ id, name }), categoryNodes),
                remove: async (id) => wrap(await actions.removeCategory({ id }), categoryNodes),
              }}
            />
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        People for Split are managed on the{" "}
        <Link href="/quick-pay/persons" className="underline underline-offset-4 hover:text-foreground">
          Person Management
        </Link>{" "}
        page.
      </p>
    </div>
  );
}
