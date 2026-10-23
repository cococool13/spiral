import { describe, expect, it } from "vitest";
import { parseSearchPage } from "./types";

describe("parseSearchPage", () => {
  it("keeps id and resolution and drops download urls", () => {
    const page = parseSearchPage({
      items: [
        {
          id: "w-abc",
          resolution: "1920x1080",
          thumbUrl: "https://th.wallhaven.cc/small/ab/abc.jpg",
          fullUrl: "https://w.wallhaven.cc/full/ab/wallhaven-abc.jpg",
        },
      ],
      page: 1,
      lastPage: 2,
    });
    expect(page.items).toEqual([{ id: "w-abc", resolution: "1920x1080" }]);
    expect(JSON.stringify(page)).not.toMatch(/http|wallhaven|thumbUrl|fullUrl/);
  });
});
