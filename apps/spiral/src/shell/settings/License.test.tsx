import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ModuleState } from "../../boot";
import { SettingsPane } from "./SettingsPane";
import type { GeneralSettings } from "./api";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "provider_view") return { kind: "absent" };
    if (cmd === "license_view") return { kind: "licensed", grace: false };
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

function show() {
  return render(
    <SettingsPane
      settings={settings}
      modules={modules}
      enabled={["wallpaper", "resume"]}
      active="wallpaper"
      license={{ kind: "licensed", grace: false }}
      knownUpdate={null}
      onSettings={() => undefined}
      onTools={() => undefined}
      onUpdateFound={() => undefined}
      onLicense={() => undefined}
    />,
  );
}

describe("settings license and tools", () => {
  it("keeps the license key and email on License, and the API keys on Tools", async () => {
    show();
    fireEvent.click(screen.getByRole("tab", { name: "License" }));
    expect(screen.getByText("This Mac is licensed.")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Anthropic" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "License key" }));
    expect(screen.getByLabelText("License key")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Tools" }));
    expect(await screen.findByRole("heading", { name: "Anthropic" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "OpenAI" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Compatible" })).toBeTruthy();
    expect(screen.queryByLabelText("License key")).toBeNull();
  });
});
