"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { setKeywordsAction } from "../actions";
import { MAX_KEYWORD_LENGTH, parseKeywords } from "../keywords";
import type { CategoryTreeNode } from "../types";

interface Row {
  id: string;
  name: string;
  keywords: string[];
  sub: boolean;
}

const rowsOf = (tree: readonly CategoryTreeNode[]): Row[] =>
  tree.flatMap((m) => [{ id: m.id, name: m.name, keywords: m.keywords, sub: false }, ...m.subs.map((s) => ({ id: s.id, name: s.name, keywords: s.keywords, sub: true }))]);

/**
 * Words that pick a category from the Reason in Quick Entry. For example Food: dosa, idli, lunch; Travel: petrol, rapido.
 * Add, edit (click a word) and remove words for any category. A word can belong to one category only.
 */
export function KeywordEditor({ tree, setKeywords, onTree, initialVisible }: { tree: readonly CategoryTreeNode[]; setKeywords: typeof setKeywordsAction; onTree: (tree: CategoryTreeNode[]) => void; initialVisible?: number }) {
  const [expanded, setExpanded] = useState(false);
  const all = rowsOf(tree);
  const rows = initialVisible && !expanded ? all.slice(0, initialVisible) : all;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Add a category first, then give it keywords here.</p>;
  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-xl border">
        {rows.map((row) => (
          <KeywordRow key={row.id} row={row} setKeywords={setKeywords} onTree={onTree} />
        ))}
      </ul>
      {initialVisible && all.length > initialVisible ? (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="text-sm font-medium underline-offset-4 hover:underline">
          {expanded ? "See less" : `See more (${all.length - rows.length} more)`}
        </button>
      ) : null}
    </div>
  );
}

function KeywordRow({ row, setKeywords, onTree }: { row: Row; setKeywords: typeof setKeywordsAction; onTree: (tree: CategoryTreeNode[]) => void }) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit(next: string[]) {
    setSaving(true);
    setError(null);
    const result = await setKeywords({ categoryId: row.id, keywords: next });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    onTree(result.tree);
    return true;
  }

  async function add() {
    const added = parseKeywords(text);
    if (added.length === 0) return;
    if (added.some((k) => k.length > MAX_KEYWORD_LENGTH)) return setError(`Use at most ${MAX_KEYWORD_LENGTH} characters per word.`);
    const merged = [...row.keywords, ...added.filter((k) => !row.keywords.includes(k))];
    if (await commit(merged)) setText("");
  }

  async function rename(old: string) {
    const [replacement] = parseKeywords(editText);
    setEditing(null);
    if (!replacement || replacement === old) return;
    await commit(row.keywords.map((k) => (k === old ? replacement : k)).filter((k, i, all) => all.indexOf(k) === i));
  }

  return (
    <li className={cn("space-y-2 px-3 py-3", row.sub && "bg-muted/20 pl-8")}>
      <p className={cn("text-sm", row.sub ? "text-muted-foreground" : "font-semibold")}>{row.name}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {row.keywords.map((k) =>
          editing === k ? (
            <Input
              key={k}
              autoFocus
              value={editText}
              aria-label={`Edit keyword ${k}`}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={() => void rename(k)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void rename(k);
                } else if (e.key === "Escape") setEditing(null);
              }}
              className="h-7 w-32 text-base sm:text-sm"
            />
          ) : (
            <span key={k} className="flex items-center gap-0.5 rounded-full border bg-background py-0.5 pr-0.5 pl-2.5 text-sm">
              <button
                type="button"
                onClick={() => {
                  setEditing(k);
                  setEditText(k);
                }}
                className="hover:underline"
                aria-label={`Edit keyword ${k}`}
              >
                {k}
              </button>
              <button type="button" aria-label={`Remove keyword ${k}`} disabled={saving} onClick={() => void commit(row.keywords.filter((x) => x !== k))} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-destructive">
                <X className="size-3" />
              </button>
            </span>
          ),
        )}
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          className="flex items-center gap-1.5"
        >
          <Input aria-label={`Add keywords to ${row.name}`} placeholder="Add words, e.g. dosa, idli" value={text} onChange={(e) => setText(e.target.value)} className="h-8 w-44 text-base sm:text-sm" />
          <Button type="submit" size="sm" variant="outline" disabled={saving || text.trim() === ""}>
            {saving ? <Loader2 className="animate-spin" /> : <Plus />} Add
          </Button>
        </form>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  );
}
