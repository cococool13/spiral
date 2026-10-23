import { describe, expect, it } from "vitest";
import { renditionFor, thumbSrc } from "./thumbs";

describe("thumbs", () => {
  it("uses the small rendition at 480 device pixels and large above", () => {
    expect(renditionFor(480)).toBe("sm");
    expect(renditionFor(481)).toBe("lg");
  });

  it("builds a thumb url with no wallhaven host", () => {
    expect(thumbSrc("w-abc", "sm", "macos")).toBe("thumb://localhost/w-abc?r=sm");
    expect(thumbSrc("w-abc", "lg", "windows")).toBe("http://thumb.localhost/w-abc?r=lg");
    expect(thumbSrc("w-abc", "sm", "macos")).not.toMatch(/wallhaven/);
  });

  it("uses the dev painter when browser QA installs one", () => {
    const target = globalThis as { __SPIRAL_THUMB__?: (id: string) => string };
    target.__SPIRAL_THUMB__ = (id) => `data:image/svg+xml,${id}`;
    try {
      expect(thumbSrc("w-abc", "sm", "macos")).toBe("data:image/svg+xml,w-abc");
      expect(thumbSrc("w-abc", "sm", "macos")).not.toMatch(/wallhaven|http/);
    } finally {
      delete target.__SPIRAL_THUMB__;
    }
  });
});
