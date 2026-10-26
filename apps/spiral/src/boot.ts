export type ModuleId = "wallpaper" | "resume";

export interface ModuleState {
  id: ModuleId;
  enabled: boolean;
  available: boolean;
  unavailableReason: string | null;
}

export type Start =
  | { kind: "picker"; preselect: ModuleId[] }
  | { kind: "module"; id: ModuleId };

export interface BootState {
  version: string;
  platform: "macos" | "windows";
  modules: ModuleState[];
  start: Start;
  bench: boolean;
  /** Native features this machine can run, decided by Rust at launch. */
  capabilities: NativeCapabilities;
}

export interface NativeCapabilities {
  /** Pin wallpaper to all Spaces: macOS 13+ with Spiral Live in the bundle. */
  pinAllSpaces: boolean;
  pinReason: string | null;
}

const NO_NATIVE: NativeCapabilities = { pinAllSpaces: false, pinReason: null };

const MODULE_IDS: readonly ModuleId[] = ["wallpaper", "resume"];

export class BootShapeError extends Error {
  override readonly name = "BootShapeError";

  constructor(detail: string) {
    super(`Spiral could not read its start state. ${detail}`);
  }
}

let cached: BootState | undefined;

export function readBoot(value: unknown): BootState {
  const boot = parseBoot(value);
  cached = boot;
  return boot;
}

export function benchEnabled(): boolean {
  return cached?.bench === true;
}

/** What Rust said this machine can run; all off before boot is read. */
export function nativeCapabilities(): NativeCapabilities {
  return cached?.capabilities ?? NO_NATIVE;
}

function parseBoot(value: unknown): BootState {
  if (!isRecord(value)) {
    throw new BootShapeError("The boot value is missing.");
  }
  if (typeof value.version !== "string" || value.version.length === 0) {
    throw new BootShapeError("The version is missing.");
  }
  if (value.platform !== "macos" && value.platform !== "windows") {
    throw new BootShapeError("The platform is missing.");
  }
  if (!Array.isArray(value.modules)) {
    throw new BootShapeError("The module list is missing.");
  }
  const modules = value.modules.map(parseModule);
  for (const id of MODULE_IDS) {
    if (!modules.some((module) => module.id === id)) {
      throw new BootShapeError("A tool is missing.");
    }
  }
  if (typeof value.bench !== "boolean") {
    throw new BootShapeError("The bench flag is missing.");
  }
  return {
    version: value.version,
    platform: value.platform,
    modules,
    start: parseStart(value.start),
    bench: value.bench,
    capabilities: parseCapabilities(value.capabilities),
  };
}

/** Missing means an older shell: every native capability off. */
function parseCapabilities(value: unknown): NativeCapabilities {
  if (value === undefined) return NO_NATIVE;
  if (!isRecord(value) || typeof value.pinAllSpaces !== "boolean") {
    throw new BootShapeError("The capability list is missing.");
  }
  if (value.pinReason !== null && value.pinReason !== undefined && typeof value.pinReason !== "string") {
    throw new BootShapeError("The capability list is missing.");
  }
  return { pinAllSpaces: value.pinAllSpaces, pinReason: (value.pinReason as string | null | undefined) ?? null };
}

function parseModule(value: unknown): ModuleState {
  if (!isRecord(value) || !isModuleId(value.id)) {
    throw new BootShapeError("A tool entry is missing.");
  }
  if (typeof value.enabled !== "boolean" || typeof value.available !== "boolean") {
    throw new BootShapeError("A tool flag is missing.");
  }
  if (value.unavailableReason !== null && typeof value.unavailableReason !== "string") {
    throw new BootShapeError("A tool reason is missing.");
  }
  return {
    id: value.id,
    enabled: value.enabled,
    available: value.available,
    unavailableReason: value.unavailableReason,
  };
}

function parseStart(value: unknown): Start {
  if (!isRecord(value)) {
    throw new BootShapeError("The start route is missing.");
  }
  if (value.kind === "picker") {
    if (!Array.isArray(value.preselect) || !value.preselect.every(isModuleId)) {
      throw new BootShapeError("The preselect list is missing.");
    }
    return { kind: "picker", preselect: value.preselect };
  }
  if (value.kind === "module" && isModuleId(value.id)) {
    return { kind: "module", id: value.id };
  }
  throw new BootShapeError("The start route is missing.");
}

function isModuleId(value: unknown): value is ModuleId {
  return value === "wallpaper" || value === "resume";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

declare global {
  interface Window {
    __SPIRAL_BOOT__?: unknown;
  }
}
