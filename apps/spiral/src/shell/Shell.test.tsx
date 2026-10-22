import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(async () => null),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(async () => "2.0.0"),
}));

describe("shell license", () => {
  beforeEach(() => {
    invoke.mockReset();
    window.__SPIRAL_BOOT__ = {
      version: "2.0.0",
      platform: "macos",
      modules: [
        { id: "wallpaper", enabled: true, available: true, unavailableReason: null },
        { id: "resume", enabled: true, available: true, unavailableReason: null },
      ],
      start: { kind: "picker", preselect: ["wallpaper", "resume"] },
      bench: false,
    };
  });

  it("keeps the license offer off the picker while the check is running", async () => {
    let release: (value: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "license_view") return pending;
      if (cmd === "general_view") {
        return { launchAtLogin: false, autoUpdateCheck: false, fitMode: "fill" };
      }
      return undefined;
    });

    const { default: Shell } = await import("./Shell");
    render(<Shell />);

    expect(screen.getByRole("heading", { name: "Which tools do you want?" })).toBeTruthy();
    expect(screen.queryByText(/found your key/)).toBeNull();

    await act(async () => {
      release({ kind: "needsActivation", offer: "wallpaper" });
      await pending;
    });
    expect(screen.queryByText(/found your key/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Spiral found your key from Spiral Wallpaper.")).toBeTruthy();
  });
});
