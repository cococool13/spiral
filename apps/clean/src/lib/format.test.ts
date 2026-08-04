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
  it("rolls a value that rounds to 1024 into the next unit (KB to MB)", () => {
    // 1023.9 KB rounds to "1024" in its own unit — must land in MB instead.
    expect(formatBytes(1023.9 * 1024)).toBe("1.0 MB");
  });
  it("rolls a value that rounds to 1024 into the next unit (MB to GB)", () => {
    expect(formatBytes(1023.9 * 1024 ** 2)).toBe("1.0 GB");
  });
});
