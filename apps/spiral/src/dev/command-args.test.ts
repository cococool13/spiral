import { describe, expect, it } from "vitest";
import { assertCommandArgs } from "./command-args";

describe("command arguments", () => {
  it("requires the legacy app under the name Rust reads", () => {
    expect(() => assertCommandArgs("license_use_legacy", { app: "wallpaper" })).toThrow(/legacy/);
    expect(() => assertCommandArgs("license_use_legacy", { legacy: "wallpaper" })).not.toThrow();
  });

  it("requires the provider and the key together", () => {
    expect(() => assertCommandArgs("provider_set", { provider: "anthropic" })).toThrow(/key/);
    expect(() =>
      assertCommandArgs("provider_set", { provider: "anthropic", key: "sk-test" }),
    ).not.toThrow();
  });
});
