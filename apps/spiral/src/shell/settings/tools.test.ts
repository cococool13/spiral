import { describe, expect, it } from "vitest";
import { nextModuleSet } from "./moduleSet";

const both = { wallpaper: true, resume: true } as const;

describe("tool set", () => {
  it("refuses to turn off the last tool", () => {
    expect(nextModuleSet(["wallpaper"], both, "wallpaper", false)).toBeNull();
    expect(nextModuleSet(["resume"], both, "resume", false)).toBeNull();
  });

  it("refuses a tool this Mac cannot open", () => {
    expect(nextModuleSet(["wallpaper"], { wallpaper: true, resume: false }, "resume", true)).toBeNull();
  });
});
