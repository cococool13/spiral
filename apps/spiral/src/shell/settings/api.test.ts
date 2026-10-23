import { describe, expect, it, vi } from "vitest";
import { generalUpdate, parseGeneral } from "./api";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

describe("general settings", () => {
  it("keeps launch, update check, and fit, and drops a secret field", () => {
    const parsed = parseGeneral({
      launchAtLogin: true,
      autoUpdateCheck: false,
      fitMode: "fit",
      analyticsOptOut: true,
      license: "should-not-cross",
    });
    expect(parsed).toEqual({
      launchAtLogin: true,
      autoUpdateCheck: false,
      fitMode: "fit",
      analyticsOptOut: true,
    });
    expect(parsed).not.toHaveProperty("license");
  });

  it("updates through general_update with those three fields", async () => {
    const next = {
      launchAtLogin: true,
      autoUpdateCheck: false,
      fitMode: "fit" as const,
      analyticsOptOut: false,
    };
    invoke.mockResolvedValue(next);
    await expect(generalUpdate(next)).resolves.toEqual(next);
    expect(invoke).toHaveBeenCalledWith("general_update", { settings: next });
  });
});
