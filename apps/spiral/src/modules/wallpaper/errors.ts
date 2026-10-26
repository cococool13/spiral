const COPY: Record<string, (source: string) => string> = {
  offline: (source) => `No connection. Spiral couldn't reach ${source}. Check your network, then try again.`,
  rate_limited: (source) =>
    source === "Wallhaven"
      ? "Wallhaven allows about 45 requests a minute. Wait a moment, then try again."
      : `Spiral spaces out requests to ${source} to stay inside its limits. Wait a few minutes, then try again.`,
  bad_response: (source) => `${source} sent an unexpected response. Try again in a minute.`,
  source_unavailable: (source) => `${source} did not answer as expected. Try again later, or pick another source.`,
  download_failed: () => "The download stopped partway. Try again.",
  too_large: () => "This image is over 40 MB, so Spiral didn't download it. Pick a smaller wallpaper.",
  bad_image: () => "The file that arrived wasn't an image, so Spiral discarded it. Try another wallpaper.",
  module_inactive: () => "Wallpaper is not open.",
  unknown_wallpaper: () => "That wallpaper is no longer in this page. Search again.",
};

/** Plain words for a native error code. `source` names who was asked. */
export function errorCopy(error: unknown, source = "Wallhaven"): string {
  const raw = String(error);
  if (raw.startsWith("apply_failed")) {
    const screen = raw.slice("apply_failed:".length);
    if (screen.length > 0) {
      return `The image downloaded. It couldn't be set on ${screen}. Restart Spiral, then try again.`;
    }
    return "The image downloaded. It couldn't be set as your wallpaper. Restart Spiral, then try again.";
  }
  const code = raw.split(":")[0];
  const known = COPY[code];
  if (known) return known(source);
  if (raw.includes(" ")) return raw;
  return COPY.bad_response(source);
}
