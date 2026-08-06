// @vitest-environment jsdom
//
// Scope, deliberately narrow: the states the Rust side cannot assert. Every
// parsing rule is already proven in `health.rs` and `startup.rs`, so this
// suite covers only what crosses the bridge and what the screen decides:
//
//  - An unavailable field is *shown as unavailable*, not hidden. ADR-0017
//    makes independent failure the whole design; a field that silently
//    vanished would make a stale parser indistinguishable from a machine
//    that genuinely has no such reading.
//  - An item with no control renders its handoff instead. ADR-0008 forbids
//    showing a control that cannot work, and this screen is the only place
//    that rule is visible.
//  - A toggle sends the item's own `label`, never its display name. Two
//    items can share a display name; only the label addresses a service.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import Optimize, { formatUptime } from "./Optimize";
import type { HealthReport, StartupInventory, StartupItem } from "./Optimize";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

const FULL_HEALTH: HealthReport = {
  storage: { total_bytes: 500_000_000_000, available_bytes: 120_000_000_000 },
  smart: "Verified",
  battery: { cycle_count: 104, condition: "Good", maximum_capacity: "99%" },
  local_snapshots: 3,
  uptime_seconds: 100_000,
  model: "Mac16,7",
  macos_version: "27.0",
};

const EMPTY_HEALTH: HealthReport = {
  storage: null,
  smart: null,
  battery: null,
  local_snapshots: null,
  uptime_seconds: null,
  model: null,
  macos_version: null,
};

const EMPTY_STARTUP: StartupInventory = { user_agents: [], system: [], login_items: [] };

function item(over: Partial<StartupItem> = {}): StartupItem {
  return {
    label: "com.example.agent",
    name: "agent",
    path: "/Users/x/Library/LaunchAgents/com.example.agent.plist",
    tier: "user-agent",
    state: "enabled",
    controllable: true,
    handoff: null,
    ...over,
  };
}

function wire(health: HealthReport, startup: StartupInventory) {
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === "health_report") return Promise.resolve(health);
    if (cmd === "startup_list") return Promise.resolve(startup);
    return Promise.resolve(undefined);
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Health", () => {
  it("shows every field it was given", async () => {
    wire(FULL_HEALTH, EMPTY_STARTUP);
    render(<Optimize />);

    expect(await screen.findByText(/112 GB free of 466 GB/)).toBeTruthy();
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(screen.getByText(/Good, 104 cycles, 99% of original capacity/)).toBeTruthy();
    expect(screen.getByText(/3 — these hold space/)).toBeTruthy();
    expect(screen.getByText("Mac16,7")).toBeTruthy();
    expect(screen.getByText("27.0")).toBeTruthy();
  });

  it("says Unavailable rather than hiding a field it could not read", async () => {
    // The ADR-0017 contract made visible. If a renamed key ever turns a
    // field to null, the row must still be there saying so.
    wire(EMPTY_HEALTH, EMPTY_STARTUP);
    render(<Optimize />);

    await screen.findByText("Free space");
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(6);
  });

  it("omits the battery row entirely on a machine with no battery", async () => {
    // Distinct from Unavailable: a desktop has no battery, which is not the
    // same as a battery we failed to read.
    wire({ ...FULL_HEALTH, battery: null }, EMPTY_STARTUP);
    render(<Optimize />);

    await screen.findByText("Free space");
    expect(screen.queryByText("Battery")).toBeNull();
  });

  it("distinguishes zero snapshots from unreadable snapshots", async () => {
    wire({ ...EMPTY_HEALTH, local_snapshots: 0 }, EMPTY_STARTUP);
    render(<Optimize />);
    expect(await screen.findByText("None")).toBeTruthy();
  });

  it("survives a battery with no capacity figure", async () => {
    wire(
      { ...FULL_HEALTH, battery: { cycle_count: 12, condition: "Normal", maximum_capacity: null } },
      EMPTY_STARTUP,
    );
    render(<Optimize />);
    expect(await screen.findByText("Normal, 12 cycles")).toBeTruthy();
  });
});

describe("formatUptime", () => {
  it("reads in days and hours", () => {
    expect(formatUptime(100_000)).toBe("1 day, 3 hours");
    expect(formatUptime(172_800)).toBe("2 days");
    expect(formatUptime(7200)).toBe("2 hours");
    expect(formatUptime(3600)).toBe("1 hour");
  });

  it("does not claim zero for a machine just booted", () => {
    expect(formatUptime(0)).toBe("Less than an hour");
    expect(formatUptime(59)).toBe("Less than an hour");
  });
});

describe("Startup Items", () => {
  it("offers a toggle for a controllable user agent", async () => {
    wire(EMPTY_HEALTH, { ...EMPTY_STARTUP, user_agents: [item()] });
    render(<Optimize />);

    const box = (await screen.findByLabelText("Open at login")) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(false);
  });

  it("shows the handoff instead of a control when there is none", async () => {
    // ADR-0008: no control is shown that cannot work.
    wire(EMPTY_HEALTH, {
      ...EMPTY_STARTUP,
      system: [
        item({
          label: "com.vendor.daemon",
          tier: "system",
          controllable: false,
          handoff: "Managed by the system.",
        }),
      ],
    });
    render(<Optimize />);

    expect(await screen.findByText("Managed by the system.")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("renders a login item read-only with its handoff", async () => {
    wire(EMPTY_HEALTH, {
      ...EMPTY_STARTUP,
      login_items: [
        item({
          label: "Unknown Developer",
          name: "Unnamed login item",
          path: null,
          tier: "login-item",
          state: "unknown",
          controllable: false,
          handoff: "macOS owns this list.",
        }),
      ],
    });
    render(<Optimize />);

    expect(await screen.findByText("Unnamed login item")).toBeTruthy();
    expect(screen.getByText("macOS owns this list.")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("leaves a control inert when the state could not be read", async () => {
    wire(EMPTY_HEALTH, { ...EMPTY_STARTUP, user_agents: [item({ state: "unknown" })] });
    render(<Optimize />);

    const box = (await screen.findByLabelText("State unknown")) as HTMLInputElement;
    expect(box.disabled).toBe(true);
  });

  it("sends the label, never the display name", async () => {
    // Two agents can share a display name; only the label addresses a
    // service. Sending the wrong one either fails or hits the wrong item.
    wire(EMPTY_HEALTH, {
      ...EMPTY_STARTUP,
      user_agents: [item({ label: "com.example.agent", name: "agent" })],
    });
    render(<Optimize />);

    fireEvent.click(await screen.findByLabelText("Open at login"));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("startup_set_enabled", {
        label: "com.example.agent",
        enabled: false,
      }),
    );
  });

  it("surfaces a refusal and re-reads the list", async () => {
    wire(EMPTY_HEALTH, { ...EMPTY_STARTUP, user_agents: [item()] });
    render(<Optimize />);
    await screen.findByLabelText("Open at login");

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "startup_set_enabled")
        return Promise.reject("com.example.agent is no longer in your login items.");
      if (cmd === "health_report") return Promise.resolve(EMPTY_HEALTH);
      return Promise.resolve({ ...EMPTY_STARTUP, user_agents: [] });
    });

    fireEvent.click(screen.getByLabelText("Open at login"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("no longer in your login items");
    await waitFor(() => expect(screen.getByText("Nothing of your own opens at login.")).toBeTruthy());
  });

  it("keeps Health when the startup list fails", async () => {
    // Two independent commands. One failing must not blank the other.
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "health_report") return Promise.resolve(FULL_HEALTH);
      return Promise.reject("no access");
    });
    render(<Optimize />);

    expect(await screen.findByText("Verified")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Could not read your login items");
  });

  it("keeps the startup list when Health fails", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "health_report") return Promise.reject("bridge error");
      return Promise.resolve({ ...EMPTY_STARTUP, user_agents: [item()] });
    });
    render(<Optimize />);

    expect(await screen.findByLabelText("Open at login")).toBeTruthy();
  });
});
