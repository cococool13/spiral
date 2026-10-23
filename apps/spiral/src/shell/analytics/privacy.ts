export type ToolName = "wallpaper" | "resume";
export type Activation = "first_wallpaper_applied" | "first_resume_exported";
export type AnalyticsRoute = "picker" | "wallpaper" | "resume" | "settings" | "activate";
export type PlatformLabel = "macOS" | "Windows";

export interface LoadGate {
  key: string;
  optedOut: boolean;
  doNotTrack: string | null;
  globalPrivacyControl: boolean;
  testRun: boolean;
}

export interface OutboundEvent {
  event: string;
  properties?: Record<string, unknown>;
  $set?: unknown;
  $set_once?: unknown;
  $unset?: unknown;
}

const URL_PROPERTIES = ["$current_url", "$pathname", "$referrer", "$host"] as const;

const ALLOWED = new Set<string>([
  "token",
  "distinct_id",
  "$process_person_profile",
  "$geoip_disable",
  "app",
  "platform",
  "version",
  "activation",
  "tool",
  ...URL_PROPERTIES,
]);

const DISTINCT_ID = /^[A-Za-z0-9._:-]{1,200}$/;
const BUY_ORIGIN = "https://licensing.cohencool.workers.dev";

export function mayLoad(gate: LoadGate): boolean {
  return (
    gate.key !== "" &&
    !gate.optedOut &&
    gate.doNotTrack !== "1" &&
    !gate.globalPrivacyControl &&
    !gate.testRun
  );
}

export function readDoNotTrack(nav: Navigator): string | null {
  return typeof nav.doNotTrack === "string" ? nav.doNotTrack : null;
}

export function readGlobalPrivacyControl(nav: Navigator): boolean {
  const flag = (nav as Navigator & { globalPrivacyControl?: unknown }).globalPrivacyControl;
  return flag === true;
}

export function platformLabel(source: "macos" | "windows" | null, userAgent: string): PlatformLabel {
  if (source === "windows") return "Windows";
  if (source === "macos") return "macOS";
  return /Windows/i.test(userAgent) ? "Windows" : "macOS";
}

export function versionLabel(version: string, build: string | null): string {
  const clean = version.trim();
  if (build === null) return clean;
  const number = build.trim();
  if (number.length === 0 || number === clean) return clean;
  return `${clean} (${number})`;
}

export function isLicensingBuyUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === BUY_ORIGIN && parsed.pathname.startsWith("/buy/");
  } catch {
    return false;
  }
}

export function withDistinctId(url: string, distinctId: string | null, enabled: boolean): string {
  if (!enabled || distinctId === null || !DISTINCT_ID.test(distinctId) || !isLicensingBuyUrl(url)) {
    return url;
  }
  const parsed = new URL(url);
  parsed.searchParams.set("ph", distinctId);
  return parsed.toString();
}

export function sanitizeEvent<T extends OutboundEvent>(event: T | null, route: AnalyticsRoute): T | null {
  if (!event) return event;
  const properties: Record<string, unknown> = { ...(event.properties ?? {}) };
  for (const key of URL_PROPERTIES) {
    if (key in properties) properties[key] = route;
  }
  for (const key of Object.keys(properties)) {
    if (!ALLOWED.has(key)) delete properties[key];
  }
  properties.$geoip_disable = true;
  event.properties = properties;
  delete event.$set;
  delete event.$set_once;
  delete event.$unset;
  return event;
}
