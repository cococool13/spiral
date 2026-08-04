import { describe, expect, it } from "vitest";
import { formatBytes } from "./format";

describe("formatBytes", () => {
  it("keeps small values in bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });
  it("shows one decimal below ten units", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
  it("rounds at ten units and above", () => {
    expect(formatBytes(20 * 1024 * 1024)).toBe("20 MB");
  });
  it("stops at terabytes", () => {
    expect(formatBytes(5 * 1024 ** 4)).toBe("5.0 TB");
  });
});
