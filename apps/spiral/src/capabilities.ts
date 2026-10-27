import { nativeCapabilities } from "./boot";

/**
 * Features whose UI exists but whose native half does not ship yet.
 *
 * A flag is false until the native work behind it lands, and turns on in the
 * same commit. `pinAllSpaces` has landed; it is also off unless boot says
 * this machine can run it (macOS 13+ with Spiral Live in the bundle). The
 * browser mock (`src/dev/tauri-mock.ts`) sets `__SPIRAL_CAPS__` so the parked
 * screens can be reviewed; production builds never read that override.
 */
export interface Capabilities {
  /** Generative and video wallpapers drawn behind the desktop. */
  liveWallpaper: boolean;
  /** Pick a display for each wallpaper instead of all of them. */
  applyPerDisplay: boolean;
  /** Pause a live wallpaper on battery, full-screen apps, Low Power Mode, lock. */
  pauseRules: boolean;
  /** Put back the wallpaper the person had before Spiral changed it. */
  restoreOriginal: boolean;
  /** Keep one still on every Space through Spiral Live (macOS 13+). The
   *  native half ships; boot says whether this machine can run it. */
  pinAllSpaces: boolean;
}

const SHIPPING: Capabilities = {
  liveWallpaper: false,
  applyPerDisplay: false,
  pauseRules: false,
  // Native undo and restore landed (wallpaper/history.rs). The control still
  // hides where `wallpaper_history` says the desktop cannot be read.
  restoreOriginal: true,
  pinAllSpaces: true,
};

declare global {
  interface Window {
    __SPIRAL_CAPS__?: Partial<Capabilities>;
  }
}

export function capabilities(): Capabilities {
  const here = { ...SHIPPING, pinAllSpaces: SHIPPING.pinAllSpaces && nativeCapabilities().pinAllSpaces };
  if (import.meta.env.DEV && typeof window !== "undefined" && window.__SPIRAL_CAPS__) {
    return { ...here, ...window.__SPIRAL_CAPS__ };
  }
  return here;
}

/** True when a parked screen is on only because the browser mock asked for it. */
export function previewing(): boolean {
  return import.meta.env.DEV && typeof window !== "undefined" && window.__SPIRAL_CAPS__ !== undefined;
}
