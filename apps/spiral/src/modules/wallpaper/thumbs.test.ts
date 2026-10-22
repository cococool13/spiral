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
});
