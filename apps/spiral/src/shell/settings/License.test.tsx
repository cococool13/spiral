import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { ModuleState } from "../../boot";
import type { LicenseView } from "../license/types";
import { SettingsPane } from "./SettingsPane";
import type { GeneralSettings } from "./api";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "provider_view") return { kind: "absent" };
    if (cmd === "license_clear") return undefined;
    if (cmd === "license_view") return { kind: "needsActivation", offer: null };
    return undefined;
  }),
}));

const settings: GeneralSettings = {
  launchAtLogin: false,
  autoUpdateCheck: true,
  fitMode: "fill",
  analyticsOptOut: false,
};

const modules: ModuleState[] = [
  { id: "wallpaper", enabled: true, available: true, unavailableReason: null },
  { id: "resume", enabled: true, available: true, unavailableReason: null },
];

const licensed: LicenseView = {
  kind: "licensed",
  grace: false,
  key: "LIC1…4f2a",
  device: "This computer · a1b2c3d4",
};

function show(initial: LicenseView = licensed) {
  function Harness() {
    const [view, setView] = useState(initial);
    return (
      <SettingsPane
        settings={settings}
        modules={modules}
        enabled={["wallpaper", "resume"]}
        active="wallpaper"
        license={view}
        knownUpdate={null}
        onSettings={() => undefined}
        onTools={() => undefined}
        onUpdateFound={() => undefined}
        onLicense={setView}
      />
    );
  }
  return render(<Harness />);
}

describe("settings license and tools", () => {
  it("shows the license on this computer, and the API keys on Tools", async () => {
    show();
    fireEvent.click(screen.getByRole("tab", { name: "License" }));
    expect(screen.getByText("This Mac is licensed.")).toBeTruthy();
    expect(screen.getByText("LIC1…4f2a")).toBeTruthy();
    expect(screen.getByText("This computer · a1b2c3d4")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lost your key?" })).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByLabelText("License key")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Anthropic" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Tools" }));
    expect(await screen.findByRole("heading", { name: "Anthropic" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "OpenAI" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Compatible" })).toBeTruthy();
    expect(screen.queryByLabelText("License key")).toBeNull();
  });

  it("shows the activation form when this Mac is not licensed", () => {
    show({ kind: "needsActivation", offer: null });
    fireEvent.click(screen.getByRole("tab", { name: "License" }));
    expect(screen.getByText("This Mac is not licensed.")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("remove returns to the activation form", async () => {
    show();
    fireEvent.click(screen.getByRole("tab", { name: "License" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByLabelText("Email")).toBeTruthy();
    expect(invoke).toHaveBeenCalledWith("license_clear");
  });

  it("keeps the form off while the license check is still running", () => {
    show({ kind: "checking" });
    fireEvent.click(screen.getByRole("tab", { name: "License" }));
    expect(screen.getByText("Checking the license.")).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });
});
