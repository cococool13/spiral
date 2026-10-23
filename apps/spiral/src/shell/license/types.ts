export type LegacyApp = "wallpaper" | "resume" | "clean" | "slim";

export type LicenseView =
  | { kind: "checking" }
  | { kind: "licensed"; grace: boolean; key: string; device: string }
  | { kind: "needsActivation"; offer: LegacyApp | null }
  | { kind: "retry"; message: string }
  | { kind: "locked"; message: string };

export type ProviderId = "anthropic" | "openai" | "compatible";

export type ProviderView =
  | { kind: "present" }
  | { kind: "needsPaste" }
  | { kind: "absent" };

const LEGACY_APPS: readonly LegacyApp[] = ["wallpaper", "resume", "clean", "slim"];

export function legacyName(app: LegacyApp): string {
  switch (app) {
    case "wallpaper":
      return "Spiral Wallpaper";
    case "resume":
      return "Spiral Resume";
    case "clean":
      return "Spiral Clean";
    case "slim":
      return "Spiral Slim";
  }
}

export function parseLicenseView(value: unknown): LicenseView {
  if (!isRecord(value)) {
    throw new Error("Spiral could not read the license state.");
  }
  if (value.kind === "checking") return { kind: "checking" };
  if (value.kind === "licensed" && typeof value.grace === "boolean") {
    return {
      kind: "licensed",
      grace: value.grace,
      key: typeof value.key === "string" ? value.key : "",
      device: typeof value.device === "string" ? value.device : "",
    };
  }
  if (value.kind === "needsActivation" && (value.offer === null || isLegacy(value.offer))) {
    return { kind: "needsActivation", offer: value.offer };
  }
  if (value.kind === "retry" && typeof value.message === "string" && value.message.length > 0) {
    return { kind: "retry", message: value.message };
  }
  if (value.kind === "locked" && typeof value.message === "string" && value.message.length > 0) {
    return { kind: "locked", message: value.message };
  }
  throw new Error("Spiral could not read the license state.");
}

export function parseProviderView(value: unknown): ProviderView {
  if (!isRecord(value)) {
    throw new Error("Spiral could not read that provider.");
  }
  if (value.kind === "present" || value.kind === "needsPaste" || value.kind === "absent") {
    return { kind: value.kind };
  }
  throw new Error("Spiral could not read that provider.");
}

function isLegacy(value: unknown): value is LegacyApp {
  return LEGACY_APPS.some((app) => app === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
