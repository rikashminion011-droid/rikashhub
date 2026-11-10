"use client";

import { ChevronRight, FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AddOptionDialog, ConfirmDialog } from "@/components/shared/option-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface TreeNode {
  id: string;
  name: string;
  children: { id: string; name: string }[];
  /** Small label next to a main item, e.g. "Wallet / UPI". */
  badge?: string;
}

export type TreeResult = { ok: true; nodes: TreeNode[] } | { ok: false; error: string };

export interface TreeActions {
  addMain: (name: string) => Promise<TreeResult>;
  addSub: (mainId: string, name: string) => Promise<TreeResult>;
  rename: (id: string, name: string) => Promise<TreeResult>;
  remove: (id: string) => Promise<TreeResult>;
}

type Dialog =
  | null
  | { type: "addMain" }
  | { type: "addSub"; main: TreeNode }
  | { type: "rename"; id: string; name: string; isMain: boolean }
  | { type: "remove"; id: string; name: string; isMain: boolean };

/**
 * A two-level list (main files and the items under them) with add, edit and delete at both levels.
 * Used for bank details (GPay → HDFC, SBI) and categories (Food → Dosa, Idli).
 */
export function TreeEditor({
  initialNodes,
  actions,
  nouns,
  mainExtra,
}: {
  initialNodes: TreeNode[];
  actions: TreeActions;
  nouns: { main: string; sub: string };
  /** Extra controls for the "add main" dialog (e.g. the bank type). */
  mainExtra?: ReactNode;
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [quickName, setQuickName] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  /** Runs an action, shows the refreshed list, and returns an error message for the dialog (or null). */
  async function run(call: Promise<TreeResult>, success: string): Promise<string | null> {
    const result = await call;
    if (!result.ok) return result.error;
    setNodes(result.nodes);
    toast.success(success);
    return null;
  }

  async function quickAdd(event: React.FormEvent) {
    event.preventDefault();
    if (adding) return;
    if (!quickName.trim()) {
      setQuickError("Enter a name.");
      return;
    }
    setAdding(true);
    const message = await run(actions.addMain(quickName), `${capitalise(nouns.main)} added.`);
    setAdding(false);
    if (message) setQuickError(message);
    else {
      setQuickName("");
      setQuickError(null);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={quickAdd} noValidate method="post" className="space-y-1.5">
        <Label htmlFor={`add-${nouns.main}`}>Add a {nouns.main}</Label>
        <div className="flex gap-2">
          <Input
            id={`add-${nouns.main}`}
            autoComplete="off"
            maxLength={60}
            placeholder={`Name of the ${nouns.main}`}
            value={quickName}
            aria-invalid={!!quickError}
            onChange={(e) => {
              setQuickName(e.target.value);
              setQuickError(null);
            }}
          />
          <Button type="submit" disabled={adding} className="shrink-0">
            <FolderPlus /> Add
          </Button>
        </div>
        {quickError ? (
          <p role="alert" className="text-xs text-destructive">
            {quickError}
          </p>
        ) : null}
        {mainExtra ? <div className="pt-1">{mainExtra}</div> : null}
      </form>

      {nodes.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          Nothing here yet. Add your first {nouns.main} above.
        </p>
      ) : (
        <ul className="space-y-3">
          {nodes.map((node) => (
            <li key={node.id}>
              <Card className="gap-0 py-0">
                <CardContent className="p-0">
                  <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    <p className="min-w-0 flex-1 truncate font-medium">{node.name}</p>
                    {node.badge ? <Badge variant="secondary">{node.badge}</Badge> : null}
                    <Badge variant="outline" className="tabular-nums">
                      {node.children.length} {node.children.length === 1 ? nouns.sub : `${nouns.sub}s`}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => setDialog({ type: "addSub", main: node })}>
                      <Plus /> Add {nouns.sub}
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${node.name}`} onClick={() => setDialog({ type: "rename", id: node.id, name: node.name, isMain: true })}>
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${node.name}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDialog({ type: "remove", id: node.id, name: node.name, isMain: true })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  {node.children.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-muted-foreground">No {nouns.sub}s yet.</p>
                  ) : (
                    <ul className="divide-y">
                      {node.children.map((child) => (
                        <li key={child.id} className="flex items-center gap-2 py-2 pr-4 pl-11">
                          <p className="min-w-0 flex-1 truncate text-sm">{child.name}</p>
                          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${node.name} → ${child.name}`} onClick={() => setDialog({ type: "rename", id: child.id, name: child.name, isMain: false })}>
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Delete ${node.name} → ${child.name}`}
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setDialog({ type: "remove", id: child.id, name: child.name, isMain: false })}
                          >
                            <Trash2 />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <AddOptionDialog
        open={dialog?.type === "addSub"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog?.type === "addSub" ? `Add ${nouns.sub} under ${dialog.main.name}` : ""}
        placeholder={`Name of the ${nouns.sub}`}
        onSave={(name) => (dialog?.type === "addSub" ? run(actions.addSub(dialog.main.id, name), `${capitalise(nouns.sub)} added.`) : Promise.resolve(null))}
      />
      <AddOptionDialog
        open={dialog?.type === "rename"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog?.type === "rename" ? `Rename ${dialog.name}` : ""}
        description="Past entries follow the new name automatically."
        initialValue={dialog?.type === "rename" ? dialog.name : ""}
        saveLabel="Save name"
        onSave={(name) => (dialog?.type === "rename" ? run(actions.rename(dialog.id, name), "Name updated.") : Promise.resolve(null))}
      />
      <ConfirmDialog
        open={dialog?.type === "remove"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog?.type === "remove" ? `Delete "${dialog.name}"?` : ""}
        description={
          dialog?.type === "remove" && dialog.isMain
            ? `It disappears from the lists, together with its ${nouns.sub}s. Entries you already saved keep their details.`
            : "It disappears from the lists. Entries you already saved keep their details."
        }
        confirmLabel="Delete"
        onConfirm={() => (dialog?.type === "remove" ? run(actions.remove(dialog.id), "Deleted.") : Promise.resolve(null))}
      />
    </div>
  );
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
