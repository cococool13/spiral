import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { General } from "./General";
import type { GeneralSettings } from "./api";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
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
});
