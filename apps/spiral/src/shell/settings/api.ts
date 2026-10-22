import { invoke } from "@tauri-apps/api/core";

export type FitMode = "fill" | "fit" | "center";

export interface GeneralSettings {
  launchAtLogin: boolean;
  autoUpdateCheck: boolean;
  fitMode: FitMode;
}

const FIT_MODES = new Set<FitMode>(["fill", "fit", "center"]);

export function parseGeneral(value: unknown): GeneralSettings {
  if (!isRecord(value) || typeof value.launchAtLogin !== "boolean") {
    throw new Error("Spiral could not read settings.");
  }
  if (typeof value.autoUpdateCheck !== "boolean" || typeof value.fitMode !== "string") {
    throw new Error("Spiral could not read settings.");
  }
  if (!FIT_MODES.has(value.fitMode as FitMode)) {
    throw new Error("Spiral could not read settings.");
  }
  return {
    launchAtLogin: value.launchAtLogin,
    autoUpdateCheck: value.autoUpdateCheck,
    fitMode: value.fitMode as FitMode,
  };
}

export function generalView(): Promise<GeneralSettings> {
  return invoke("general_view").then(parseGeneral);
}

export function generalUpdate(settings: GeneralSettings): Promise<GeneralSettings> {
  const next = parseGeneral(settings);
  return invoke("general_update", { settings: next }).then(parseGeneral);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
