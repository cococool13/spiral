import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { General } from "./General";
import type { GeneralSettings } from "./api";

const invoke = vi.hoisted(() => vi.fn());
const setSharing = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

vi.mock("../analytics/client", () => ({
  setSharing,
}));

const settings: GeneralSettings = {
  launchAtLogin: false,
  autoUpdateCheck: true,
  fitMode: "fill",
  analyticsOptOut: false,
};

function offer(visible: boolean) {
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === "rename_offer") return { visible, otherCopy: null };
    if (cmd === "thumb_cache_size") return 0;
    return undefined;
  });
}

beforeEach(() => {
  invoke.mockReset();
  setSharing.mockReset();
});

describe("rename row", () => {
  it("stays hidden unless the offer is visible", async () => {
    offer(false);
    render(<General settings={settings} onSettings={() => undefined} />);
    expect(await screen.findByRole("heading", { name: "Thumbnail cache" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rename this app to Spiral" })).toBeNull();
  });

  it("offers the rename when the bundle can be renamed", async () => {
    offer(true);
    render(<General settings={settings} onSettings={() => undefined} />);
    expect(await screen.findByRole("button", { name: "Rename this app to Spiral" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep this name" })).toBeTruthy();
  });

  it("turns usage stats off immediately", async () => {
    invoke.mockImplementation(async (cmd: string, args?: { settings?: GeneralSettings }) => {
      if (cmd === "rename_offer") return { visible: false, otherCopy: null };
      if (cmd === "thumb_cache_size") return 0;
      if (cmd === "general_update") return args?.settings;
      return undefined;
    });
    render(<General settings={settings} onSettings={() => undefined} />);
    fireEvent.click(screen.getByRole("switch", { name: "Share anonymous usage stats" }));
    expect(setSharing).toHaveBeenCalledWith(false);
    expect(invoke).toHaveBeenCalledWith("general_update", {
      settings: { ...settings, analyticsOptOut: true },
    });
    expect(screen.getByText("Anonymous and privacy-safe. No personal data or content, IP discarded.")).toBeTruthy();
  });
});
