import { z } from "zod";
import { ACCOUNT_ITEM, ALL_NAV_ITEMS, FOOD_ITEMS, NAV_ITEMS, QUICK_PAY_ITEMS } from "@/config/navigation";

/**
 * How the side navigator is laid out for a user: headings (sections), which page is in which, what each page is called,
 * and which pages are hidden. Pure functions on plain data, so it is easy to test and the same rules run in the browser and
 * on the server. A page is identified by its address (for example "/quick-pay").
 */

export const MAX_TITLE_LENGTH = 30;
export const MAX_SECTIONS = 12;

export interface NavSection {
  id: string;
  /** The heading shown above its pages. Empty means no heading. */
  title: string;
  itemIds: string[];
}

export interface NavLayout {
  sections: NavSection[];
  /** Names chosen by the user, by page. A page without an entry keeps its built-in name. */
  titles: Record<string, string>;
  /** Pages that are not shown in the navigator. */
  hidden: string[];
}

const KNOWN = new Set(ALL_NAV_ITEMS.map((i) => i.href));
const DEFAULT_TITLE = new Map(ALL_NAV_ITEMS.map((i) => [i.href, i.title]));

export const defaultTitleOf = (id: string) => DEFAULT_TITLE.get(id) ?? id;

/** The built-in layout: the modules, then Quick Pay, Food and Account. */
export const DEFAULT_LAYOUT: NavLayout = {
  sections: [
    { id: "main", title: "", itemIds: NAV_ITEMS.map((i) => i.href) },
    { id: "quick-pay", title: "Quick Pay", itemIds: QUICK_PAY_ITEMS.map((i) => i.href) },
    { id: "food", title: "Food", itemIds: FOOD_ITEMS.map((i) => i.href) },
    { id: "account", title: "Account", itemIds: [ACCOUNT_ITEM.href] },
  ],
  titles: {},
  hidden: [],
};

/** Which built-in section a page belongs to, for putting a page that is missing from a saved layout back. */
const HOME_SECTION = new Map(DEFAULT_LAYOUT.sections.flatMap((s) => s.itemIds.map((id) => [id, s.id] as const)));

export const layoutSchema = z.object({
  sections: z
    .array(z.object({ id: z.string().min(1).max(60), title: z.string().max(200), itemIds: z.array(z.string().max(200)).max(100) }))
    .max(MAX_SECTIONS, `At most ${MAX_SECTIONS} headings.`),
  titles: z.record(z.string().max(200), z.string().max(200)),
  hidden: z.array(z.string().max(200)).max(100),
});

const clean = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH).trim();

/**
 * Makes any layout safe to use: unknown pages are dropped, every page appears exactly once (a page added to the app later,
 * or missing from a saved layout, goes back in its built-in section), names are tidied, and at least one page stays visible.
 * Anything unreadable falls back to the built-in layout.
 */
export function normalizeLayout(input: unknown): NavLayout {
  const parsed = layoutSchema.safeParse(input);
  if (!parsed.success) return structuredClone(DEFAULT_LAYOUT);
  const raw = parsed.data;

  const seenSections = new Set<string>();
  const placed = new Set<string>();
  const sections: NavSection[] = [];
  for (const s of raw.sections) {
    if (seenSections.has(s.id)) continue;
    seenSections.add(s.id);
    const itemIds = s.itemIds.filter((id) => KNOWN.has(id) && !placed.has(id) && placed.add(id));
    sections.push({ id: s.id, title: clean(s.title), itemIds });
  }
  if (sections.length === 0) return structuredClone(DEFAULT_LAYOUT);

  for (const item of ALL_NAV_ITEMS) {
    if (placed.has(item.href)) continue;
    const home = sections.find((s) => s.id === HOME_SECTION.get(item.href)) ?? sections.at(-1)!;
    home.itemIds.push(item.href);
  }

  const titles: Record<string, string> = {};
  for (const [id, title] of Object.entries(raw.titles)) {
    const name = clean(title);
    if (KNOWN.has(id) && name !== "" && name !== defaultTitleOf(id)) titles[id] = name;
  }

  let hidden = [...new Set(raw.hidden.filter((id) => KNOWN.has(id)))];
  if (KNOWN.size > 0 && hidden.length >= KNOWN.size) hidden = hidden.slice(1); // something must stay visible
  return { sections, titles, hidden };
}

// ───────────────────────── Reading ─────────────────────────

export const titleOf = (layout: NavLayout, id: string) => layout.titles[id] ?? defaultTitleOf(id);

export const isHidden = (layout: NavLayout, id: string) => layout.hidden.includes(id);

/** The sections to draw: hidden pages left out, and a section with nothing left to show left out too. */
export function visibleSections(layout: NavLayout): { id: string; title: string; items: { id: string; title: string }[] }[] {
  return layout.sections
    .map((s) => ({ id: s.id, title: s.title, items: s.itemIds.filter((id) => !isHidden(layout, id)).map((id) => ({ id, title: titleOf(layout, id) })) }))
    .filter((s) => s.items.length > 0);
}

export function sameLayout(a: NavLayout, b: NavLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ───────────────────────── Editing ─────────────────────────

const copy = (layout: NavLayout): NavLayout => structuredClone(layout);

/**
 * Moves a page one place up or down. At the top or bottom of a heading it moves into the neighbouring heading, so a page
 * can be carried across the whole navigator with the same two buttons.
 */
export function moveItem(layout: NavLayout, id: string, delta: -1 | 1): NavLayout {
  const next = copy(layout);
  const from = next.sections.findIndex((s) => s.itemIds.includes(id));
  if (from < 0) return layout;
  const section = next.sections[from]!;
  const at = section.itemIds.indexOf(id);
  const to = at + delta;
  if (to >= 0 && to < section.itemIds.length) {
    [section.itemIds[at], section.itemIds[to]] = [section.itemIds[to]!, section.itemIds[at]!];
    return next;
  }
  const neighbour = next.sections[from + delta];
  if (!neighbour) return layout;
  section.itemIds.splice(at, 1);
  if (delta < 0) neighbour.itemIds.push(id);
  else neighbour.itemIds.unshift(id);
  return next;
}

/** Where a dragged page lands: just before or after another page, or at the start or end of a heading. */
export type ItemDrop = { kind: "before" | "after"; id: string } | { kind: "start" | "end"; sectionId: string };

/**
 * Drops a page at a chosen place (used by drag and drop). Dropping on the heading of an empty section works, so a page can
 * be dragged into a heading with nothing in it. An impossible drop leaves the layout as it is.
 */
export function moveItemTo(layout: NavLayout, id: string, target: ItemDrop): NavLayout {
  if (("id" in target && target.id === id) || !layout.sections.some((s) => s.itemIds.includes(id))) return layout;
  const next = copy(layout);
  const source = next.sections.find((s) => s.itemIds.includes(id))!;
  source.itemIds = source.itemIds.filter((x) => x !== id);

  if ("sectionId" in target) {
    const section = next.sections.find((s) => s.id === target.sectionId);
    if (!section) return layout;
    if (target.kind === "start") section.itemIds.unshift(id);
    else section.itemIds.push(id);
  } else {
    const section = next.sections.find((s) => s.itemIds.includes(target.id));
    if (!section) return layout;
    const at = section.itemIds.indexOf(target.id);
    section.itemIds.splice(target.kind === "before" ? at : at + 1, 0, id);
  }
  return sameLayout(next, layout) ? layout : next;
}

/** Drops a heading, with its pages, just before or after another heading. */
export function moveSectionTo(layout: NavLayout, sectionId: string, target: { kind: "before" | "after"; id: string }): NavLayout {
  if (target.id === sectionId) return layout;
  const next = copy(layout);
  const from = next.sections.findIndex((s) => s.id === sectionId);
  if (from < 0 || !next.sections.some((s) => s.id === target.id)) return layout;
  const [moved] = next.sections.splice(from, 1);
  const at = next.sections.findIndex((s) => s.id === target.id);
  next.sections.splice(target.kind === "before" ? at : at + 1, 0, moved!);
  return sameLayout(next, layout) ? layout : next;
}

/** Puts a page at the end of a chosen heading. */
export function moveItemToSection(layout: NavLayout, id: string, sectionId: string): NavLayout {
  const next = copy(layout);
  const target = next.sections.find((s) => s.id === sectionId);
  const source = next.sections.find((s) => s.itemIds.includes(id));
  if (!target || !source || target === source) return layout;
  source.itemIds = source.itemIds.filter((x) => x !== id);
  target.itemIds.push(id);
  return next;
}

/** Moves a heading, with its pages, one place up or down. */
export function moveSection(layout: NavLayout, sectionId: string, delta: -1 | 1): NavLayout {
  const from = layout.sections.findIndex((s) => s.id === sectionId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= layout.sections.length) return layout;
  const next = copy(layout);
  [next.sections[from], next.sections[to]] = [next.sections[to]!, next.sections[from]!];
  return next;
}

/** Renames a page. An empty name goes back to its built-in name. */
export function renameItem(layout: NavLayout, id: string, title: string): NavLayout {
  if (!KNOWN.has(id)) return layout;
  const next = copy(layout);
  const name = title.slice(0, MAX_TITLE_LENGTH);
  if (name.trim() === "" || name.trim() === defaultTitleOf(id)) delete next.titles[id];
  else next.titles[id] = name;
  return next;
}

/** Renames a heading. An empty title means no heading is shown. */
export function renameSection(layout: NavLayout, sectionId: string, title: string): NavLayout {
  const next = copy(layout);
  const section = next.sections.find((s) => s.id === sectionId);
  if (!section) return layout;
  section.title = title.slice(0, MAX_TITLE_LENGTH);
  return next;
}

/** Adds a new, empty heading at the end. Move pages into it with Move to, or the up and down buttons. */
export function addSection(layout: NavLayout, id: string, title: string): NavLayout {
  if (layout.sections.length >= MAX_SECTIONS || layout.sections.some((s) => s.id === id)) return layout;
  const next = copy(layout);
  next.sections.push({ id, title: title.slice(0, MAX_TITLE_LENGTH), itemIds: [] });
  return next;
}

/** Removes a heading. Its pages are kept: they join the heading above it (or below, for the first one). */
export function deleteSection(layout: NavLayout, sectionId: string): NavLayout {
  const at = layout.sections.findIndex((s) => s.id === sectionId);
  if (at < 0 || layout.sections.length <= 1) return layout;
  const next = copy(layout);
  const [gone] = next.sections.splice(at, 1);
  const receiver = next.sections[Math.max(0, at - 1)]!;
  receiver.itemIds.push(...gone!.itemIds);
  return next;
}

/** Hides or shows a page. The last visible page cannot be hidden. */
export function setHidden(layout: NavLayout, id: string, hidden: boolean): NavLayout {
  if (!KNOWN.has(id)) return layout;
  const now = isHidden(layout, id);
  if (hidden === now) return layout;
  const next = copy(layout);
  if (hidden) {
    if (KNOWN.size - layout.hidden.length <= 1) return layout;
    next.hidden.push(id);
  } else next.hidden = next.hidden.filter((x) => x !== id);
  return next;
}
