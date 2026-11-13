import { describe, expect, it } from "vitest";
import { ALL_NAV_ITEMS } from "@/config/navigation";
import {
  DEFAULT_LAYOUT,
  MAX_SECTIONS,
  MAX_TITLE_LENGTH,
  addSection,
  defaultTitleOf,
  deleteSection,
  moveItem,
  moveItemTo,
  moveItemToSection,
  moveSection,
  moveSectionTo,
  normalizeLayout,
  renameItem,
  renameSection,
  sameLayout,
  setHidden,
  titleOf,
  visibleSections,
  type NavLayout,
} from "@/features/navigation/model";

const ids = (layout: NavLayout) => layout.sections.flatMap((s) => s.itemIds);
const sectionOf = (layout: NavLayout, id: string) => layout.sections.find((s) => s.itemIds.includes(id))!.id;

describe("default layout", () => {
  it("lists every page exactly once, in four sections", () => {
    expect([...ids(DEFAULT_LAYOUT)].sort()).toEqual(ALL_NAV_ITEMS.map((i) => i.href).sort());
    expect(DEFAULT_LAYOUT.sections.map((s) => [s.id, s.title])).toEqual([["main", ""], ["quick-pay", "Quick Pay"], ["food", "Food"], ["account", "Account"]]);
    expect(DEFAULT_LAYOUT.hidden).toEqual([]);
    expect(visibleSections(DEFAULT_LAYOUT).flatMap((s) => s.items.map((i) => i.title))).toContain("Quick Entry");
  });
});

describe("normalizeLayout", () => {
  it("keeps a valid layout as it is", () => {
    const layout = moveItem(renameItem(DEFAULT_LAYOUT, "/quick-pay", "Entry"), "/debt", 1);
    expect(normalizeLayout(layout)).toEqual(layout);
  });
  it("falls back to the default for anything unreadable", () => {
    for (const bad of [null, undefined, 5, "x", {}, { sections: "no" }, { sections: [], titles: {}, hidden: [] }]) expect(normalizeLayout(bad)).toEqual(DEFAULT_LAYOUT);
  });
  it("drops unknown pages and duplicates, and puts a missing page back in its own section", () => {
    const messy = {
      sections: [
        { id: "a", title: "  Mine  ", itemIds: ["/debt", "/nope", "/debt", "/quick-pay"] },
        { id: "a", title: "dup id", itemIds: ["/food"] },
        { id: "b", title: "", itemIds: [] },
      ],
      titles: { "/debt": "  Loans  ", "/nope": "x", "/quick-pay": "   ", "/food": "Food" },
      hidden: ["/nope", "/debt", "/debt"],
    };
    const out = normalizeLayout(messy);
    expect(out.sections.map((s) => s.id)).toEqual(["a", "b"]);
    expect(out.sections[0]).toMatchObject({ title: "Mine" });
    expect(out.sections[0]!.itemIds.slice(0, 2)).toEqual(["/debt", "/quick-pay"]);
    expect([...ids(out)].sort()).toEqual(ALL_NAV_ITEMS.map((i) => i.href).sort()); // every page once
    expect(out.titles).toEqual({ "/debt": "Loans", "/food": "Food" }); // unknown pages and blank names removed; "Food" is a real rename of Monthly Food Tracking
    expect(out.hidden).toEqual(["/debt"]);
    // "/food" was missing from the kept sections, and /food's home ("food") does not exist, so it joins the last one
    expect(sectionOf(out, "/food")).toBe("b");
  });
  it("never leaves every page hidden", () => {
    const out = normalizeLayout({ ...DEFAULT_LAYOUT, hidden: ALL_NAV_ITEMS.map((i) => i.href) });
    expect(out.hidden).toHaveLength(ALL_NAV_ITEMS.length - 1);
  });
  it("limits the length of names and the number of headings", () => {
    const out = normalizeLayout({ ...DEFAULT_LAYOUT, titles: { "/debt": "x".repeat(100) } });
    expect(out.titles["/debt"]).toHaveLength(MAX_TITLE_LENGTH);
    const many = { ...DEFAULT_LAYOUT, sections: Array.from({ length: MAX_SECTIONS + 1 }, (_, i) => ({ id: `s${i}`, title: "", itemIds: [] })) };
    expect(normalizeLayout(many)).toEqual(DEFAULT_LAYOUT);
  });
});

describe("naming", () => {
  it("renames a page and goes back to the built-in name when emptied or set to it", () => {
    let l = renameItem(DEFAULT_LAYOUT, "/debt", "Loans");
    expect(titleOf(l, "/debt")).toBe("Loans");
    expect(titleOf(DEFAULT_LAYOUT, "/debt")).toBe("Debt Management"); // the original is untouched
    l = renameItem(l, "/debt", "   ");
    expect(l.titles).toEqual({});
    l = renameItem(renameItem(l, "/debt", "Loans"), "/debt", defaultTitleOf("/debt"));
    expect(l.titles).toEqual({});
    expect(renameItem(DEFAULT_LAYOUT, "/unknown", "x")).toBe(DEFAULT_LAYOUT);
  });
  it("renames a heading, and an empty heading hides its title", () => {
    const l = renameSection(DEFAULT_LAYOUT, "food", "Meals");
    expect(l.sections.find((s) => s.id === "food")!.title).toBe("Meals");
    expect(renameSection(l, "food", "").sections.find((s) => s.id === "food")!.title).toBe("");
    expect(renameSection(DEFAULT_LAYOUT, "zzz", "x")).toBe(DEFAULT_LAYOUT);
  });
});

describe("hiding", () => {
  it("hides and shows pages, which disappear from what is drawn", () => {
    const hidden = setHidden(DEFAULT_LAYOUT, "/debt", true);
    expect(visibleSections(hidden).flatMap((s) => s.items.map((i) => i.id))).not.toContain("/debt");
    expect(visibleSections(setHidden(hidden, "/debt", false)).flatMap((s) => s.items.map((i) => i.id))).toContain("/debt");
    expect(setHidden(hidden, "/debt", true)).toBe(hidden); // already hidden
  });
  it("drops a heading from view when all its pages are hidden", () => {
    const l = setHidden(DEFAULT_LAYOUT, "/food", true);
    expect(visibleSections(l).map((s) => s.id)).not.toContain("food");
  });
  it("refuses to hide the last visible page", () => {
    let l = DEFAULT_LAYOUT;
    const all = ALL_NAV_ITEMS.map((i) => i.href);
    for (const id of all.slice(0, -1)) l = setHidden(l, id, true);
    expect(setHidden(l, all.at(-1)!, true)).toBe(l);
    expect(visibleSections(l).flatMap((s) => s.items)).toHaveLength(1);
  });
});

describe("reordering", () => {
  it("moves a page up or down inside its heading", () => {
    const [a, b] = DEFAULT_LAYOUT.sections[0]!.itemIds;
    const down = moveItem(DEFAULT_LAYOUT, a!, 1);
    expect(down.sections[0]!.itemIds.slice(0, 2)).toEqual([b, a]);
    expect(moveItem(down, a!, -1)).toEqual(DEFAULT_LAYOUT);
  });
  it("carries a page across a heading at the top or bottom", () => {
    const last = DEFAULT_LAYOUT.sections[0]!.itemIds.at(-1)!;
    const down = moveItem(DEFAULT_LAYOUT, last, 1);
    expect(sectionOf(down, last)).toBe("quick-pay");
    expect(down.sections[1]!.itemIds[0]).toBe(last);
    const first = DEFAULT_LAYOUT.sections[1]!.itemIds[0]!;
    const up = moveItem(DEFAULT_LAYOUT, first, -1);
    expect(sectionOf(up, first)).toBe("main");
    expect(up.sections[0]!.itemIds.at(-1)).toBe(first);
  });
  it("stops at the very top and very bottom", () => {
    expect(moveItem(DEFAULT_LAYOUT, DEFAULT_LAYOUT.sections[0]!.itemIds[0]!, -1)).toBe(DEFAULT_LAYOUT);
    expect(moveItem(DEFAULT_LAYOUT, "/user", 1)).toBe(DEFAULT_LAYOUT);
  });
  it("moves a page to the end of a chosen heading", () => {
    const l = moveItemToSection(DEFAULT_LAYOUT, "/debt", "food");
    expect(l.sections.find((s) => s.id === "food")!.itemIds.at(-1)).toBe("/debt");
    expect(ids(l)).toHaveLength(ALL_NAV_ITEMS.length);
    expect(moveItemToSection(l, "/debt", "food")).toBe(l);
  });
  it("moves a heading with its pages", () => {
    const l = moveSection(DEFAULT_LAYOUT, "food", -1);
    expect(l.sections.map((s) => s.id)).toEqual(["main", "food", "quick-pay", "account"]);
    expect(moveSection(DEFAULT_LAYOUT, "main", -1)).toBe(DEFAULT_LAYOUT);
    expect(moveSection(DEFAULT_LAYOUT, "account", 1)).toBe(DEFAULT_LAYOUT);
  });
});

describe("headings", () => {
  it("adds a new empty heading at the end, then pages can be moved into it", () => {
    let l = addSection(DEFAULT_LAYOUT, "s1", "Favourites");
    expect(l.sections.at(-1)).toEqual({ id: "s1", title: "Favourites", itemIds: [] });
    expect(visibleSections(l).map((s) => s.id)).not.toContain("s1"); // nothing to show yet
    l = moveItemToSection(l, "/quick-pay", "s1");
    expect(visibleSections(l).at(-1)).toMatchObject({ id: "s1", title: "Favourites", items: [{ id: "/quick-pay", title: "Quick Entry" }] });
    expect(addSection(l, "s1", "again")).toBe(l); // same id twice
  });
  it("limits the number of headings", () => {
    let l = DEFAULT_LAYOUT;
    for (let i = 0; l.sections.length < MAX_SECTIONS; i++) l = addSection(l, `n${i}`, "x");
    expect(addSection(l, "one-more", "x")).toBe(l);
  });
  it("deleting a heading keeps its pages (they join the one above; the first joins the new first)", () => {
    const l = deleteSection(DEFAULT_LAYOUT, "food");
    expect(l.sections.map((s) => s.id)).toEqual(["main", "quick-pay", "account"]);
    expect(sectionOf(l, "/food")).toBe("quick-pay");
    expect(ids(l)).toHaveLength(ALL_NAV_ITEMS.length);
    const first = deleteSection(DEFAULT_LAYOUT, "main");
    expect(first.sections.map((s) => s.id)).toEqual(["quick-pay", "food", "account"]);
    expect(sectionOf(first, "/dashboard")).toBe("quick-pay");
    expect(deleteSection(DEFAULT_LAYOUT, "nope")).toBe(DEFAULT_LAYOUT);
  });
  it("cannot delete the only heading", () => {
    const one = normalizeLayout({ sections: [{ id: "x", title: "", itemIds: [] }], titles: {}, hidden: [] });
    expect(one.sections).toHaveLength(1);
    expect(deleteSection(one, "x")).toBe(one);
  });
});

describe("sameLayout", () => {
  it("compares layouts by content", () => {
    expect(sameLayout(DEFAULT_LAYOUT, structuredClone(DEFAULT_LAYOUT))).toBe(true);
    expect(sameLayout(DEFAULT_LAYOUT, renameItem(DEFAULT_LAYOUT, "/debt", "Loans"))).toBe(false);
  });
});

describe("drag and drop", () => {
  const main = DEFAULT_LAYOUT.sections[0]!.itemIds;

  it("drops a page before or after another page in the same heading", () => {
    const before = moveItemTo(DEFAULT_LAYOUT, main[3]!, { kind: "before", id: main[0]! });
    expect(before.sections[0]!.itemIds.slice(0, 4)).toEqual([main[3], main[0], main[1], main[2]]);
    const after = moveItemTo(DEFAULT_LAYOUT, main[0]!, { kind: "after", id: main[2]! });
    expect(after.sections[0]!.itemIds.slice(0, 3)).toEqual([main[1], main[2], main[0]]);
    expect(ids(after)).toHaveLength(ALL_NAV_ITEMS.length);
  });
  it("drops a page into another heading, next to a page, or at the start or end", () => {
    const qp = DEFAULT_LAYOUT.sections[1]!.itemIds;
    const next = moveItemTo(DEFAULT_LAYOUT, main[1]!, { kind: "after", id: qp[0]! });
    expect(sectionOf(next, main[1]!)).toBe("quick-pay");
    expect(next.sections[1]!.itemIds.slice(0, 2)).toEqual([qp[0], main[1]]);
    expect(moveItemTo(DEFAULT_LAYOUT, "/debt", { kind: "start", sectionId: "food" }).sections.find((s) => s.id === "food")!.itemIds[0]).toBe("/debt");
    expect(moveItemTo(DEFAULT_LAYOUT, "/debt", { kind: "end", sectionId: "account" }).sections.find((s) => s.id === "account")!.itemIds.at(-1)).toBe("/debt");
  });
  it("can drop a page onto a heading that has no pages yet", () => {
    const withNew = addSection(DEFAULT_LAYOUT, "empty", "Empty");
    const out = moveItemTo(withNew, "/debt", { kind: "start", sectionId: "empty" });
    expect(out.sections.find((s) => s.id === "empty")!.itemIds).toEqual(["/debt"]);
  });
  it("ignores a drop on itself, on something unknown, or that changes nothing", () => {
    expect(moveItemTo(DEFAULT_LAYOUT, main[0]!, { kind: "before", id: main[0]! })).toBe(DEFAULT_LAYOUT);
    expect(moveItemTo(DEFAULT_LAYOUT, main[0]!, { kind: "after", id: "/nope" })).toBe(DEFAULT_LAYOUT);
    expect(moveItemTo(DEFAULT_LAYOUT, main[0]!, { kind: "start", sectionId: "nope" })).toBe(DEFAULT_LAYOUT);
    expect(moveItemTo(DEFAULT_LAYOUT, "/nope", { kind: "start", sectionId: "food" })).toBe(DEFAULT_LAYOUT);
    expect(moveItemTo(DEFAULT_LAYOUT, main[1]!, { kind: "after", id: main[0]! })).toBe(DEFAULT_LAYOUT); // already there
  });
  it("drops a heading, with its pages, before or after another heading", () => {
    expect(moveSectionTo(DEFAULT_LAYOUT, "account", { kind: "before", id: "quick-pay" }).sections.map((s) => s.id)).toEqual(["main", "account", "quick-pay", "food"]);
    expect(moveSectionTo(DEFAULT_LAYOUT, "main", { kind: "after", id: "food" }).sections.map((s) => s.id)).toEqual(["quick-pay", "food", "main", "account"]);
    expect(moveSectionTo(DEFAULT_LAYOUT, "food", { kind: "before", id: "food" })).toBe(DEFAULT_LAYOUT);
    expect(moveSectionTo(DEFAULT_LAYOUT, "food", { kind: "after", id: "quick-pay" })).toBe(DEFAULT_LAYOUT); // already there
    expect(moveSectionTo(DEFAULT_LAYOUT, "nope", { kind: "before", id: "food" })).toBe(DEFAULT_LAYOUT);
    expect(moveSectionTo(DEFAULT_LAYOUT, "food", { kind: "before", id: "nope" })).toBe(DEFAULT_LAYOUT);
  });
});
