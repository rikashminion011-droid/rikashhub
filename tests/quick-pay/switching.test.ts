import { describe, expect, it } from "vitest";
import { nextSwitch, switchIds } from "@/features/quick-pay/switching";
import type { SwitchSettings } from "@/features/quick-pay/settings-model";

const cfg = (over: Partial<SwitchSettings> = {}): SwitchSettings => ({ enabled: true, mode: "SEQUENTIAL", order: [], startId: null, ...over });
const people = ["office", "mukesh", "dhanush", "bala"];

describe("sequential switching", () => {
  it("moves one by one and restarts after the last", () => {
    const c = cfg();
    expect(nextSwitch(c, people, "office")).toBe("mukesh");
    expect(nextSwitch(c, people, "bala")).toBe("office");
    expect(nextSwitch(c, people, null)).toBe("office");
    expect(nextSwitch(c, [], null)).toBeNull();
  });
});

describe("custom order", () => {
  it("follows the configured order: Office, Mukesh, Dhanush, Bala", () => {
    const c = cfg({ mode: "CUSTOM", order: ["bala", "office", "dhanush"] });
    expect(switchIds(c, people)).toEqual(["bala", "office", "dhanush"]);
    expect(nextSwitch(c, people, "bala")).toBe("office");
    expect(nextSwitch(c, people, "dhanush")).toBe("bala");
    // an option that is not in the list jumps to the start
    expect(nextSwitch(c, people, "mukesh")).toBe("bala");
  });
  it("ignores options that no longer exist, and falls back to sequential when none are left", () => {
    expect(switchIds(cfg({ mode: "CUSTOM", order: ["gone", "mukesh"] }), people)).toEqual(["mukesh"]);
    expect(switchIds(cfg({ mode: "CUSTOM", order: ["gone"] }), people)).toEqual(people);
  });
  it("the first press lands on the starting option when one is set", () => {
    const c = cfg({ mode: "CUSTOM", order: ["bala", "office"], startId: "office" });
    expect(nextSwitch(c, people, null)).toBe("office");
    expect(nextSwitch(cfg({ startId: "dhanush" }), people, null)).toBe("dhanush");
    expect(nextSwitch(cfg({ startId: "gone" }), people, null)).toBe("office");
  });
});
