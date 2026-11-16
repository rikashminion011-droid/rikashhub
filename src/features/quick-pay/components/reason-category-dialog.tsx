"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CategoryOption } from "../types";

/**
 * "Put this reason under a category": choose a category that already exists, or type a new one, and from then on typing this
 * reason picks that category by itself.
 */
export function ReasonCategoryDialog({
  open,
  onOpenChange,
  reason,
  categories,
  currentId,
  onAssign,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: string;
  categories: CategoryOption[];
  currentId: string | null;
  onAssign: (input: { categoryId: string | null; newCategory?: string }) => Promise<string | null>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">{open ? <Body reason={reason} categories={categories} currentId={currentId} onAssign={onAssign} onClose={() => onOpenChange(false)} /> : null}</DialogContent>
    </Dialog>
  );
}

function Body({ reason, categories, currentId, onAssign, onClose }: { reason: string; categories: CategoryOption[]; currentId: string | null; onAssign: (input: { categoryId: string | null; newCategory?: string }) => Promise<string | null>; onClose: () => void }) {
  const mains = categories.filter((c) => !c.isSub);
  const [categoryId, setCategoryId] = useState(currentId && mains.some((c) => c.id === currentId) ? currentId : "");
  const [fresh, setFresh] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!fresh.trim() && !categoryId) return setError("Choose a category, or type a new one.");
    setSaving(true);
    setError(null);
    const problem = await onAssign(fresh.trim() ? { categoryId: null, newCategory: fresh.trim() } : { categoryId });
    setSaving(false);
    if (problem) return setError(problem);
    onClose();
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle>Category for “{reason}”</DialogTitle>
        <DialogDescription>Next time you type this reason, this category is chosen for you.</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="rc-existing">Existing category</Label>
        <select
          id="rc-existing"
          value={categoryId}
          disabled={fresh.trim() !== ""}
          onChange={(e) => setCategoryId(e.target.value)}
          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 sm:text-sm"
        >
          <option value="">Choose a category…</option>
          {mains.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rc-new">Or a new category</Label>
        <Input id="rc-new" maxLength={60} placeholder="New category name" value={fresh} onChange={(e) => setFresh(e.target.value)} className="h-10 text-base sm:text-sm" />
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null} Save
        </Button>
      </DialogFooter>
    </form>
  );
}
