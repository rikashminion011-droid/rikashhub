import { describe, expect, it } from "vitest";
import { availablePersons, visibleBanks } from "@/features/quick-pay/availability";
import { DEFAULT_SETTINGS } from "@/features/quick-pay/settings-model";

const options = {
  banks: [
    { id: "b1", label: "GPay → Canara", mainName: "GPay", name: "Canara" },
    { id: "b2", label: "GPay → IDFC", mainName: "GPay", name: "IDFC" },
  ],
  persons: [{ id: "p1", name: "Mukesh" }, { id: "p2", name: "Balan" }],
  settings: { ...DEFAULT_SETTINGS, banks: { hiddenIds: ["b2"] }, split: { ...DEFAULT_SETTINGS.split, hiddenPersonIds: ["p2"] }, debt: { ...DEFAULT_SETTINGS.debt, hiddenPersonIds: ["p1"] } },
};

describe("what Quick Entry offers", () => {
  it("leaves hidden banks out, but keeps the one already chosen", () => {
    expect(visibleBanks(options).map((b) => b.id)).toEqual(["b1"]);
    expect(visibleBanks(options, ["b2"]).map((b) => b.id)).toEqual(["b1", "b2"]);
  });
  it("leaves hidden people out of Split and Debt separately, and keeps people already chosen", () => {
    expect(availablePersons(options, "SPLIT").map((p) => p.id)).toEqual(["p1"]);
    expect(availablePersons(options, "DEBT").map((p) => p.id)).toEqual(["p2"]);
    expect(availablePersons(options, "SPLIT", ["p2"]).map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});
