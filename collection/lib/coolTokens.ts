/**
 * The /cool light palette, read off :root at runtime.
 *
 * Same discipline as `InteractiveGrid` uses for the brand palette: the values
 * live in `/brand/tokens.css` and are read from the cascade, never retyped
 * here, so the page can never drift from the token file. The fallbacks below
 * exist only for the first frame before styles resolve.
 *
 * `--cool-*` is a scoped exception to the palette rule and belongs to this
 * page alone. Nothing outside `app/cool/` may read these.
 */

const FALLBACK: Record<string, string> = {
  "--cool-void": "#06070a",
  "--cool-asphalt": "#16181c",
  "--cool-sodium": "#ff9d4a",
  "--cool-tungsten": "#ffc98a",
  "--cool-mercury": "#cfe0f5",
  "--cool-dusk": "#26406e",
  "--cool-horizon": "#ff7b52",
  "--cool-daylight": "#e8eff7",
  "--cool-moss": "#46523c",
  "--spiral-red": "#d52e2b",
  "--spiral-steel": "#666863",
  "--spiral-gray": "#8c8d8a",
  "--spiral-paper": "#f4f3f0",
  "--spiral-black": "#0b0b0c",
};

/** Resolve one custom property to a hex string. */
export function readToken(name: string): string {
  if (typeof window === "undefined") return FALLBACK[name] ?? "#ffffff";
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || FALLBACK[name] || "#ffffff";
}

/**
 * The key light through the ride, as `{ at, hex }` stops.
 *
 * Not a spectrum — a night that turns into a morning. Sodium under the
 * underpass, cold LED on the wet street, the blue hour on the open road, the
 * sunrise band, then open daylight.
 */
export function readRamp(): { at: number; hex: string }[] {
  const stops = [
    readToken("--cool-sodium"),
    readToken("--cool-sodium"),
    readToken("--cool-mercury"),
    readToken("--cool-dusk"),
    readToken("--cool-horizon"),
    readToken("--cool-daylight"),
    readToken("--cool-daylight"),
  ];
  return stops.map((hex, i) => ({ at: i / (stops.length - 1), hex }));
}
