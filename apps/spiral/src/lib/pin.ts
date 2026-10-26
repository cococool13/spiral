import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Pin wallpaper to all Spaces, through Spiral Live (`src-tauri/src/live.rs`).
 * Shared by Settings and Wallpaper's quick look, so it lives outside both.
 */
export interface PinState {
  available: boolean;
  reason: string | null;
  pinned: boolean;
  /** Spiral Live is running now, so its menu-bar item is showing. */
  running: boolean;
  keepAfterRestart: boolean;
  loginItem: "off" | "enabled" | "requiresApproval" | "notFound" | "failed";
  error: string | null;
}

/** Cohen's words, exactly: what turning the switch on does. */
export const PIN_PROMISE = "Keeps a small helper running so every Space shows this wallpaper. It shows in the menu bar.";

const LOGIN_ITEMS = new Set(["off", "enabled", "requiresApproval", "notFound", "failed"]);

const COPY: Record<string, string> = {
  pin_not_still: "Pin works with a still picture. Set a wallpaper first, then pin it.",
  pin_failed: "Spiral could not save the pin. Try again.",
  pin_off: "Pin a wallpaper first.",
  pin_mac_only: "Pin to all Spaces is for macOS.",
  pin_needs_macos13: "Pin to all Spaces needs macOS 13 or later.",
  helper_missing: "Spiral Live is missing from this copy of Spiral. Reinstall Spiral, then try again.",
  helper_failed: "Spiral could not start Spiral Live. Restart Spiral, then try again.",
  helper_silent: "Spiral Live did not answer in 3 seconds. Look for its pin in the menu bar, or restart Spiral.",
  helper_menu_bar: "Spiral Live could not add its menu-bar item, so it stopped. Make room in the menu bar, then try again.",
};

export function pinErrorCopy(error: unknown): string {
  const raw = String(error);
  const known = COPY[raw.split(":")[0]];
  if (known) return known;
  if (raw.includes(" ")) return raw;
  return COPY.pin_failed;
}

export function pinStatusCopy(state: PinState): string {
  if (!state.pinned) return "Off. Other Spaces keep their own wallpaper.";
  if (state.running) return "Pinned. Spiral Live is in the menu bar.";
  return "Pinned. Spiral Live is not running now; it starts again when you open Wallpaper.";
}

export function loginCopy(state: PinState): string {
  switch (state.loginItem) {
    case "enabled":
      return "Spiral Live opens at login and keeps this wallpaper pinned.";
    case "requiresApproval":
      return "macOS needs your OK: System Settings, General, Login Items, then allow Spiral Live.";
    case "failed":
    case "notFound":
      return "macOS did not add the login item. Try again.";
    default:
      return "Spiral Live opens at login. Off by default.";
  }
}

export function parsePinState(value: unknown): PinState {
  if (typeof value !== "object" || value === null) throw new Error("Spiral could not read the pin.");
  const v = value as Record<string, unknown>;
  for (const key of ["available", "pinned", "running", "keepAfterRestart"]) {
    if (typeof v[key] !== "boolean") throw new Error("Spiral could not read the pin.");
  }
  if (v.reason !== null && typeof v.reason !== "string") throw new Error("Spiral could not read the pin.");
  if (v.error !== null && typeof v.error !== "string") throw new Error("Spiral could not read the pin.");
  if (typeof v.loginItem !== "string" || !LOGIN_ITEMS.has(v.loginItem)) {
    throw new Error("Spiral could not read the pin.");
  }
  return {
    available: v.available as boolean,
    reason: v.reason as string | null,
    pinned: v.pinned as boolean,
    running: v.running as boolean,
    keepAfterRestart: v.keepAfterRestart as boolean,
    loginItem: v.loginItem as PinState["loginItem"],
    error: v.error as string | null,
  };
}

export function pinState(): Promise<PinState> {
  return invoke("wallpaper_pin_state").then(parsePinState);
}

export function pinAllSpaces(enabled: boolean): Promise<PinState> {
  return invoke("wallpaper_pin_all_spaces", { enabled }).then(parsePinState);
}

export function pinKeep(enabled: boolean): Promise<PinState> {
  return invoke("wallpaper_pin_keep", { enabled }).then(parsePinState);
}

export function pinResume(): Promise<PinState> {
  return invoke("wallpaper_pin_resume").then(parsePinState);
}

export interface Pin {
  state: PinState | null;
  busy: boolean;
  error: string | null;
  setPinned: (enabled: boolean) => Promise<PinState | null>;
  setKeep: (enabled: boolean) => Promise<PinState | null>;
}

/** Reads the pin when mounted (`enabled` false skips every call). */
export function usePin(enabled: boolean): Pin {
  const [state, setState] = useState<PinState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void pinState()
      .then((next) => {
        if (live) setState(next);
      })
      .catch(() => {
        if (live) setState(null);
      });
    return () => {
      live = false;
    };
  }, [enabled]);

  const run = useCallback(async (call: () => Promise<PinState>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await call();
      setState(next);
      return next;
    } catch (caught) {
      setError(pinErrorCopy(caught));
      void pinState()
        .then(setState)
        .catch(() => undefined);
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const setPinned = useCallback((on: boolean) => run(() => pinAllSpaces(on)), [run]);
  const setKeep = useCallback((on: boolean) => run(() => pinKeep(on)), [run]);
  return { state, busy, error, setPinned, setKeep };
}
