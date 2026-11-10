import { describe, expect, it } from "vitest";
import { flattenGroups, groupBanks, groupCategories } from "@/features/quick-pay/cascade";

describe("cascading main and sub names", () => {
  it("groups banks under their main name, e.g. GPay: HDFC, IDFC, DBS", () => {
    const groups = groupBanks([
      { id: "1", label: "GPay → HDFC", mainName: "GPay", name: "HDFC" },
      { id: "2", label: "GPay → IDFC", mainName: "GPay", name: "IDFC" },
      { id: "3", label: "GPay → DBS", mainName: "GPay", name: "DBS" },
      { id: "4", label: "Cash", mainName: "Cash", name: "Cash" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ name: "GPay", value: null });
    expect(groups[0]!.children.map((c) => c.name)).toEqual(["HDFC", "IDFC", "DBS"]);
    expect(groups[1]).toEqual({ name: "Cash", value: "4", children: [] });
  });

  it("makes every main category choosable, with its sub-categories beside it", () => {
    const groups = groupCategories([
      { id: "f", label: "Food", mainName: "Food", name: "Food", isSub: false },
      { id: "t", label: "Travel", mainName: "Travel", name: "Travel", isSub: false },
      { id: "d", label: "Food → Dosa", mainName: "Food", name: "Dosa", isSub: true },
      { id: "i", label: "Food → Idli", mainName: "Food", name: "Idli", isSub: true },
    ]);
    expect(groups.map((g) => [g.name, g.value, g.children.map((c) => c.name)])).toEqual([
      ["Food", "f", ["Dosa", "Idli"]],
      ["Travel", "t", []],
    ]);
  });

  it("lists everything choosable for search", () => {
    const groups = groupCategories([
      { id: "f", label: "Food", mainName: "Food", name: "Food", isSub: false },
      { id: "d", label: "Food → Dosa", mainName: "Food", name: "Dosa", isSub: true },
    ]);
    expect(flattenGroups(groups)).toEqual([{ value: "f", label: "Food" }, { value: "d", label: "Food → Dosa" }]);
    expect(flattenGroups(groupBanks([{ id: "1", label: "GPay → HDFC", mainName: "GPay", name: "HDFC" }]))).toEqual([{ value: "1", label: "GPay → HDFC" }]);
  });

  it("ignores a sub-category whose main is missing", () => {
    expect(groupCategories([{ id: "d", label: "Food → Dosa", mainName: "Food", name: "Dosa", isSub: true }])).toEqual([]);
  });
});
