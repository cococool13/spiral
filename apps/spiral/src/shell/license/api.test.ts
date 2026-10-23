import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { licenseUseLegacy } from "./api";

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
});
