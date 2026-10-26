import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readBoot } from "../../boot";
import { capabilities } from "../../capabilities";
import { loginCopy, parsePinState, PIN_PROMISE, pinErrorCopy, type PinState } from "../../lib/pin";
import { PinRows } from "./PinRows";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const off: PinState = {
  available: true,
  reason: null,
  pinned: false,
  running: false,
  keepAfterRestart: false,
  loginItem: "off",
  error: null,
};

function boot(pinAllSpaces: boolean) {
  readBoot({
    version: "2.0.0",
    platform: "macos",
    modules: [
      { id: "wallpaper", enabled: true, available: true, unavailableReason: null },
      { id: "resume", enabled: true, available: true, unavailableReason: null },
    ],
    start: { kind: "module", id: "wallpaper" },
    bench: false,
    capabilities: { pinAllSpaces, pinReason: pinAllSpaces ? null : "pin_needs_macos13" },
  });
}

beforeEach(() => invoke.mockReset());
afterEach(cleanup);

describe("pin capability", () => {
  it("follows what Rust says this Mac can run", () => {
    boot(false);
    expect(capabilities().pinAllSpaces).toBe(false);
    boot(true);
    expect(capabilities().pinAllSpaces).toBe(true);
  });

  it("an older boot without capabilities turns pin off", () => {
    readBoot({
      version: "2.0.0",
      platform: "macos",
      modules: [
        { id: "wallpaper", enabled: true, available: true, unavailableReason: null },
        { id: "resume", enabled: true, available: true, unavailableReason: null },
      ],
      start: { kind: "module", id: "wallpaper" },
      bench: false,
    });
    expect(capabilities().pinAllSpaces).toBe(false);
  });
});

describe("PinRows", () => {
  it("renders nothing and calls nothing where pin cannot run", () => {
    boot(false);
    const view = render(<PinRows />);
    expect(view.container.textContent).toBe("");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("says exactly what turning it on leaves running, then shows the pinned state", async () => {
    boot(true);
    let state = { ...off };
    invoke.mockImplementation(async (cmd: string, args?: { enabled?: boolean }) => {
      if (cmd === "wallpaper_pin_all_spaces") {
        state = { ...state, pinned: args?.enabled === true, running: args?.enabled === true };
      }
      if (cmd === "wallpaper_pin_keep") {
        state = { ...state, keepAfterRestart: args?.enabled === true, loginItem: "enabled" };
      }
      return state;
    });
    render(<PinRows />);
    const toggle = await screen.findByRole("switch", { name: "Pin wallpaper to all Spaces" });
    expect(screen.getByText(PIN_PROMISE)).toBeTruthy();
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByRole("switch", { name: "Keep pinned after restart" })).toBeNull();

    fireEvent.click(toggle);
    expect(await screen.findByText("Pinned. Spiral Live is in the menu bar.")).toBeTruthy();
    expect(invoke).toHaveBeenCalledWith("wallpaper_pin_all_spaces", { enabled: true });

    const keep = screen.getByRole("switch", { name: "Keep pinned after restart" });
    expect(keep.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(keep);
    expect(await screen.findByText("Spiral Live opens at login and keeps this wallpaper pinned.")).toBeTruthy();
  });

  it("names the problem and a next step when the helper does not answer", async () => {
    boot(true);
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "wallpaper_pin_all_spaces") throw "helper_silent";
      return off;
    });
    render(<PinRows />);
    fireEvent.click(await screen.findByRole("switch", { name: "Pin wallpaper to all Spaces" }));
    expect(await screen.findByText(/did not answer in 3 seconds/)).toBeTruthy();
  });
});

describe("pin copy and shape", () => {
  it("rejects a malformed state", () => {
    expect(() => parsePinState({ ...off, loginItem: "maybe" })).toThrow();
    expect(() => parsePinState({ ...off, pinned: "yes" })).toThrow();
    expect(parsePinState(off)).toEqual(off);
  });

  it("maps every error code to words", () => {
    for (const code of ["pin_not_still", "helper_missing", "helper_failed", "helper_menu_bar", "pin_needs_macos13"]) {
      expect(pinErrorCopy(code)).not.toBe(code);
    }
    expect(pinErrorCopy("weird")).toBe("Spiral could not save the pin. Try again.");
    expect(loginCopy({ ...off, loginItem: "requiresApproval" })).toMatch(/Login Items/);
  });
});
