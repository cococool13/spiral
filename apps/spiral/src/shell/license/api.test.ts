import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { licenseUseLegacy } from "./api";
import { parseLicenseView } from "./types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({ kind: "licensed", grace: false })),
}));

describe("license commands", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
  });

  it("sends the legacy app under the name Rust reads", async () => {
    await licenseUseLegacy("wallpaper");
    expect(invoke).toHaveBeenCalledWith("license_use_legacy", { legacy: "wallpaper" });
  });

  it("reads a licensed view with a masked key, and still reads one that omits it", () => {
    expect(parseLicenseView({ kind: "licensed", grace: false })).toEqual({
      kind: "licensed",
      grace: false,
      key: "",
      device: "",
    });
    expect(
      parseLicenseView({
        kind: "licensed",
        grace: true,
        key: "LIC1…4f2a",
        device: "This computer · a1b2c3d4",
      }),
    ).toEqual({
      kind: "licensed",
      grace: true,
      key: "LIC1…4f2a",
      device: "This computer · a1b2c3d4",
    });
  });
});
