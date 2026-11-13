"use client";

import { Eye, EyeOff, GripVertical, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ALL_NAV_ITEMS } from "@/config/navigation";
import { cn } from "@/lib/utils";
import type { NavActions } from "../actions";
import {
  DEFAULT_LAYOUT,
  MAX_SECTIONS,
  MAX_TITLE_LENGTH,
  addSection,
  defaultTitleOf,
  deleteSection,
  isHidden,
  moveItem,
  moveItemTo,
  moveSection,
  moveSectionTo,
  renameItem,
  renameSection,
  sameLayout,
  setHidden,
  type ItemDrop,
  type NavLayout,
} from "../model";

const ICON = new Map(ALL_NAV_ITEMS.map((i) => [i.href, i.icon]));

/** What is being dragged, and where it would land if let go now. */
type Drag = { kind: "item" | "section"; id: string };
type Hint = ItemDrop | null;

/**
 * Customize the side navigator: rename pages, add or rename headings, hide pages, and drag pages and headings by their
 * handle to reorder them (pages can be dragged into another heading). Changes are only kept when you press Save, and then
 * apply everywhere straight away.
 */
export function NavCustomizer({
  open,
  onOpenChange,
  layout,
  actions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The layout that is saved now. */
  layout: NavLayout;
  actions: NavActions;
  onSaved: (layout: NavLayout) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        {/* Mounted only while open, so it always starts from what is saved. */}
        {open ? <Editor layout={layout} actions={actions} onSaved={onSaved} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Handle({
  label,
  id,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKeyDown,
}: {
  label: string;
  id: string;
  dragging: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      data-handle={id}
      aria-label={`${label}. Drag to move, or press the up and down arrow keys.`}
      title="Drag to reorder"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
      // touch-none: on a phone, dragging the handle moves the item instead of scrolling the list
      className={cn(
        "flex size-8 shrink-0 touch-none items-center justify-center rounded-md border bg-background text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        dragging ? "cursor-grabbing text-foreground" : "cursor-grab",
      )}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );
}

function Editor({ layout, actions, onSaved, onClose }: { layout: NavLayout; actions: NavActions; onSaved: (l: NavLayout) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<NavLayout>(layout);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hint, setHint] = useState<Hint>(null);
  // The latest values, readable inside pointer handlers that fire faster than React re-renders.
  const live = useRef<{ drag: Drag | null; hint: Hint }>({ drag: null, hint: null });
  const refocus = useRef<string | null>(null);

  const dirty = !sameLayout(draft, layout);
  const visibleCount = ALL_NAV_ITEMS.length - draft.hidden.length;
  const change = (next: NavLayout) => {
    setDraft(next);
    setError(null);
  };

  // After a move with the keyboard, the handle is rebuilt in its new place: put the cursor back on it.
  useEffect(() => {
    const id = refocus.current;
    if (!id) return;
    refocus.current = null;
    document.querySelector<HTMLElement>(`[data-handle="${CSS.escape(id)}"]`)?.focus();
  }, [draft]);

  // ── Dragging ──
  function startDrag(e: ReactPointerEvent<HTMLButtonElement>, kind: Drag["kind"], id: string) {
    if (e.button !== 0 || !e.isPrimary) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // The pointer may already be gone; the drag still works without capture.
    }
    live.current = { drag: { kind, id }, hint: null };
    setDrag({ kind, id });
    setHint(null);
  }

  function moveDrag(e: ReactPointerEvent<HTMLButtonElement>) {
    const current = live.current.drag;
    if (!current) return;

    // Scroll the editor when the pointer is near its top or bottom edge.
    const scroller = e.currentTarget.closest<HTMLElement>('[role="dialog"]');
    if (scroller) {
      const box = scroller.getBoundingClientRect();
      if (e.clientY < box.top + 56) scroller.scrollTop -= 14;
      else if (e.clientY > box.bottom - 56) scroller.scrollTop += 14;
    }

    const under = document.elementFromPoint(e.clientX, e.clientY);
    let next: Hint = null;
    if (current.kind === "item") {
      const itemEl = under?.closest<HTMLElement>("[data-nav-item]");
      const headerEl = under?.closest<HTMLElement>("[data-nav-header]");
      const sectionEl = under?.closest<HTMLElement>("[data-nav-section]");
      if (itemEl) {
        const id = itemEl.dataset.navItem!;
        if (id !== current.id) {
          const box = itemEl.getBoundingClientRect();
          next = { kind: e.clientY > box.top + box.height / 2 ? "after" : "before", id };
        }
      } else if (headerEl) next = { kind: "start", sectionId: headerEl.dataset.navHeader! };
      else if (sectionEl) next = { kind: "end", sectionId: sectionEl.dataset.navSection! };
    } else {
      const sectionEl = under?.closest<HTMLElement>("[data-nav-section]");
      if (sectionEl && sectionEl.dataset.navSection !== current.id) {
        const box = sectionEl.getBoundingClientRect();
        next = { kind: e.clientY > box.top + box.height / 2 ? "after" : "before", id: sectionEl.dataset.navSection! };
      }
    }
    live.current.hint = next;
    setHint(next);
  }

  function endDrag(e: ReactPointerEvent<HTMLButtonElement>, drop: boolean) {
    const { drag: current, hint: target } = live.current;
    live.current = { drag: null, hint: null };
    setDrag(null);
    setHint(null);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Nothing to release.
    }
    if (!drop || !current || !target) return;
    if (current.kind === "item") change(moveItemTo(draft, current.id, target));
    else if ("id" in target && (target.kind === "before" || target.kind === "after")) change(moveSectionTo(draft, current.id, { kind: target.kind, id: target.id }));
  }

  // The keyboard way to reorder: arrow keys on the handle.
  function keyMove(e: ReactKeyboardEvent<HTMLButtonElement>, kind: Drag["kind"], id: string) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const delta = e.key === "ArrowUp" ? -1 : 1;
    refocus.current = id;
    change(kind === "item" ? moveItem(draft, id, delta) : moveSection(draft, id, delta));
  }

  const handleProps = (kind: Drag["kind"], id: string, label: string) => ({
    label,
    id,
    dragging: drag?.id === id,
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => startDrag(e, kind, id),
    onPointerMove: moveDrag,
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => endDrag(e, true),
    onPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>) => endDrag(e, false),
    onKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => keyMove(e, kind, id),
  });

  async function save() {
    setSaving(true);
    setError(null);
    let result: Awaited<ReturnType<NavActions["save"]>>;
    try {
      result = await actions.save(draft);
    } catch {
      result = { ok: false, error: "Could not reach the server. Nothing was saved." };
    }
    setSaving(false);
    if (!result.ok) return setError(result.error);
    onSaved(result.layout);
    toast.success("Side navigator saved.");
    onClose();
  }

  return (
    <div className="min-w-0 space-y-4">
      <DialogHeader>
        <DialogTitle>Customize side navigator</DialogTitle>
        <DialogDescription>
          Drag the handle to reorder pages and headings (drag a page into another heading to move it there). Rename pages, add headings, and hide what you do not use. Hidden pages stay available by their address, and you can show them again here.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        {draft.sections.map((section) => {
          const sectionName = section.title || "heading without a name";
          const sectionDrop = hint && "id" in hint && drag?.kind === "section" && hint.id === section.id ? hint.kind : null;
          const intoSection = drag?.kind === "item" && hint && "sectionId" in hint && hint.sectionId === section.id ? hint.kind : null;
          return (
            <section
              key={section.id}
              data-nav-section={section.id}
              aria-label={section.title || "Pages without a heading"}
              className={cn("relative rounded-xl border", drag?.id === section.id && "opacity-50", intoSection === "end" && "ring-2 ring-amber-400")}
            >
              {sectionDrop ? <span aria-hidden className={cn("pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded bg-amber-500", sectionDrop === "before" ? "-top-2" : "-bottom-2")} /> : null}

              {/* Heading row */}
              <div data-nav-header={section.id} className={cn("flex items-center gap-1.5 rounded-t-xl border-b bg-muted/40 p-2", intoSection === "start" && "ring-2 ring-amber-400 ring-inset")}>
                <Handle {...handleProps("section", section.id, `Move heading ${sectionName}`)} />
                <Input
                  aria-label="Heading"
                  placeholder="No heading"
                  value={section.title}
                  maxLength={MAX_TITLE_LENGTH}
                  onChange={(e) => change(renameSection(draft, section.id, e.target.value))}
                  className="h-9 min-w-0 flex-1 text-base font-semibold sm:text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                  aria-label={`Delete heading ${sectionName} (its pages are kept)`}
                  disabled={draft.sections.length <= 1}
                  onClick={() => change(deleteSection(draft, section.id))}
                >
                  <Trash2 />
                </Button>
              </div>

              {/* Pages under it */}
              {section.itemIds.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">No pages here yet. Drag a page onto this heading to bring it in.</p>
              ) : (
                <ul className="divide-y">
                  {section.itemIds.map((id) => {
                    const Icon = ICON.get(id);
                    const hidden = isHidden(draft, id);
                    const last = !hidden && visibleCount <= 1;
                    const name = draft.titles[id] ?? defaultTitleOf(id);
                    const drop = hint && "id" in hint && drag?.kind === "item" && hint.id === id ? hint.kind : null;
                    return (
                      <li key={id} data-nav-item={id} className={cn("relative flex items-center gap-1.5 px-2 py-2", hidden && "bg-muted/30", drag?.id === id && "opacity-40")}>
                        {drop ? <span aria-hidden className={cn("pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded bg-amber-500", drop === "before" ? "-top-px" : "-bottom-px")} /> : null}
                        <Handle {...handleProps("item", id, `Move ${name}`)} />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className={cn("text-muted-foreground hover:text-foreground disabled:opacity-30", !hidden && "text-foreground")}
                          aria-pressed={!hidden}
                          aria-label={`${hidden ? "Show" : "Hide"} ${name}`}
                          title={last ? "At least one page must stay visible" : hidden ? "Hidden: tap to show" : "Shown: tap to hide"}
                          disabled={last}
                          onClick={() => change(setHidden(draft, id, !hidden))}
                        >
                          {hidden ? <EyeOff /> : <Eye />}
                        </Button>
                        {Icon ? <Icon className={cn("size-4 shrink-0", hidden && "opacity-40")} aria-hidden /> : null}
                        <Input
                          aria-label={`Name of ${defaultTitleOf(id)}`}
                          placeholder={defaultTitleOf(id)}
                          value={draft.titles[id] ?? ""}
                          maxLength={MAX_TITLE_LENGTH}
                          onChange={(e) => change(renameItem(draft, id, e.target.value))}
                          className={cn("h-9 min-w-0 flex-1 text-base sm:text-sm", hidden && "opacity-60")}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={draft.sections.length >= MAX_SECTIONS} onClick={() => change(addSection(draft, `s-${crypto.randomUUID()}`, "New heading"))}>
          <Plus /> Add heading
        </Button>
        <Button type="button" variant="ghost" onClick={() => change(structuredClone(DEFAULT_LAYOUT))} disabled={sameLayout(draft, DEFAULT_LAYOUT)}>
          <RotateCcw /> Reset to default
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </div>
  );
}
