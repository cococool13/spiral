import { describe, expect, it } from "vitest";
import { FILTERS, PALETTE, introSentence, needsIntro, readIntroduced, swatchFill, writeIntroduced } from "./catalog";
import { itemPage } from "./library";
import { parseSearchPage, parseSearchParams, type SourceInfo } from "./types";

const INFOS: SourceInfo[] = [
  { id: "nasa", prefix: "n", name: "NASA", group: "space", licence: "", hosts: ["images-api.nasa.gov", "images-assets.nasa.gov"], optionalKey: false, keyed: false },
  { id: "esa", prefix: "e", name: "ESA/Webb and ESA/Hubble", group: "space", licence: "", hosts: ["esawebb.org"], optionalKey: false, keyed: false },
];

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  } as Storage;
}

describe("source catalogue", () => {
  it("draws Wallhaven palette values exactly, with no hash colour in the source", () => {
    expect(PALETTE).toHaveLength(29);
    expect(swatchFill("ea4c88")).toBe("rgb(234 76 136)");
  });

  it("asks before a source's first request, once", () => {
    const store = memory();
    const known = readIntroduced(store);
    expect(known.has("wallhaven")).toBe(true);
    const space = FILTERS.find((chip) => chip.id === "space");
    if (!space) throw new Error("no space chip");
    expect(needsIntro(space, known)).toEqual(["nasa", "esa"]);
    writeIntroduced(new Set([...known, "nasa", "esa"]), store);
    expect(needsIntro(space, readIntroduced(store))).toEqual([]);
  });

  it("names the hosts and what they see", () => {
    const text = introSentence(["nasa", "esa"], INFOS);
    expect(text).toContain("NASA and ESA/Webb and ESA/Hubble");
    expect(text).toContain("images-api.nasa.gov, esawebb.org");
    expect(text).toContain("IP address");
  });
});

describe("source items", () => {
  it("keeps titles and credits and refuses foreign ids", () => {
    const page = parseSearchPage({
      items: [
        { id: "a-23119", resolution: "4000x2832", title: "Water", credit: { line: "Thomas Cole, Water", licence: "CC0", page: "artic.edu/artworks/23119" } },
        { id: "c-202062422", resolution: "8000x4000", credit: { line: "x", licence: "CC BY-SA", page: "https://evil.example" } },
      ],
      page: 1,
      lastPage: 3,
      unavailable: ["rijks"],
    });
    expect(page.items[0].credit?.page).toBe("artic.edu/artworks/23119");
    expect(page.items[1].credit?.page).toBeUndefined();
    expect(page.unavailable).toEqual(["rijks"]);
    expect(itemPage(page.items[0])).toBe("artic.edu/artworks/23119");
    expect(() => parseSearchPage({ items: [{ id: "x-1", resolution: "1x1" }], page: 1, lastPage: 1 })).toThrow();
  });

  it("sends colours only for Wallhaven", () => {
    const base = { query: "", categories: "111", sorting: "toplist", page: 1, fit: true } as const;
    expect(parseSearchParams({ ...base, source: "wallhaven", colors: "336600" }).colors).toBe("336600");
    expect(() => parseSearchParams({ ...base, source: "museums", colors: "336600" })).toThrow();
    expect(() => parseSearchParams({ ...base, source: "wallhaven", colors: "33660g" })).toThrow();
  });
});
