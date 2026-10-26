import { describe, expect, it } from "vitest";
import { addRecent, fitsDisplay, pickSurprise, readRecent, RECENT_LIMIT, sizeLabel, stepRecent } from "./library";

const item = (id: string, resolution = "3840x2160") => ({ id, resolution });

describe("wallpaper library", () => {
  it("fits only images at least as large as the display", () => {
    const display = { width: 2880, height: 1800 };
    expect(fitsDisplay("3840x2160", display)).toBe(true);
    expect(fitsDisplay("2560x1440", display)).toBe(false);
    expect(fitsDisplay("3440x1440", display)).toBe(false);
    expect(fitsDisplay("nonsense", display)).toBe(false);
  });

  it("labels sizes the way people say them", () => {
    expect(sizeLabel("3840x2160")).toBe("3840 × 2160");
  });

  it("keeps recent newest first, without repeats, and bounded", () => {
    let list = [item("w-a"), item("w-b")];
    list = addRecent(list, item("w-b"));
    expect(list.map((entry) => entry.id)).toEqual(["w-b", "w-a"]);
    for (let i = 0; i < 20; i += 1) list = addRecent(list, item(`w-n${i}`));
    expect(list).toHaveLength(RECENT_LIMIT);
  });

  it("reads only well-formed recent entries", () => {
    const raw = JSON.stringify([item("w-ok"), { id: "../etc", resolution: "1x1" }, { id: 4 }]);
    expect(readRecent({ getItem: () => raw }).map((entry) => entry.id)).toEqual(["w-ok"]);
    expect(readRecent({ getItem: () => "{broken" })).toEqual([]);
  });

  it("steps through recent with [ and ]", () => {
    const list = [item("w-new"), item("w-mid"), item("w-old")];
    expect(stepRecent(list, "w-new", "[")?.id).toBe("w-mid");
    expect(stepRecent(list, "w-mid", "]")?.id).toBe("w-new");
    expect(stepRecent(list, "w-old", "[")?.id).toBe("w-new");
    expect(stepRecent([], null, "[")).toBeNull();
  });

  it("never surprises you with the wallpaper you already have", () => {
    const items = [item("w-a"), item("w-b")];
    for (const roll of [0, 0.4, 0.99]) {
      expect(pickSurprise(items, "w-a", () => roll)?.id).toBe("w-b");
    }
    expect(pickSurprise([], null)).toBeNull();
  });
});
