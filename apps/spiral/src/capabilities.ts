/**
 * Features whose UI exists but whose native half does not ship yet.
 *
 * Every flag is false in a real build. A flag turns on only when the native
 * work behind it lands and this table is changed in the same commit. The
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
  /** Search Wallhaven by colour. */
  colorSearch: boolean;
  /** Sources other than Wallhaven. */
  extraSources: boolean;
  /** Put back the wallpaper the person had before Spiral changed it. */
  restoreOriginal: boolean;
}

const SHIPPING: Capabilities = {
  liveWallpaper: false,
  applyPerDisplay: false,
  pauseRules: false,
  colorSearch: false,
  extraSources: false,
  restoreOriginal: false,
};

declare global {
  interface Window {
    __SPIRAL_CAPS__?: Partial<Capabilities>;
  }
}

export function capabilities(): Capabilities {
  if (import.meta.env.DEV && typeof window !== "undefined" && window.__SPIRAL_CAPS__) {
    return { ...SHIPPING, ...window.__SPIRAL_CAPS__ };
  }
  return SHIPPING;
}

/** True when a parked screen is on only because the browser mock asked for it. */
export function previewing(): boolean {
  return import.meta.env.DEV && typeof window !== "undefined" && window.__SPIRAL_CAPS__ !== undefined;
}
