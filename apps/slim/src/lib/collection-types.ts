/**
 * Foundational types and contracts for browser tool collection.
 * Defines stable, versioned data shapes for discovery, metadata, and execution.
 * All types are read-only and immutable once constructed.
 */

/**
 * Semantic versioning for collection schema.
 * Breaking changes increment major version - consumers must reject unsupported versions.
 */
export type SchemaVersion = string & { readonly __brand: "SchemaVersion" };

/**
 * Unique, stable identifier for a tool within a collection.
 * Must not change across versions - used as a foreign key by consumers.
 */
export type ToolId = string & { readonly __brand: "ToolId" };

/**
 * Unique, stable identifier for a preset within a tool.
 * Must be deterministic and idempotent across runs.
 */
export type PresetId = string & { readonly __brand: "PresetId" };

/**
 * Platform discriminant: linux, darwin (macOS), or win32.
 * Matches Node.js process.platform conventions.
 */
export type Platform = "linux" | "darwin" | "win32";

/**
 * DNS mode selection for hardened browser configuration.
 */
export type DNSMode = "default" | "strict" | "quad9" | "opendns" | "custom";

/**
 * Collection type defines scope and behavior of the tool.
 * - "debloat" removes unwanted features, settings, or extensions
 * - "hardening" applies security/privacy policies
 * - "optimization" tunes performance (CPU, memory, startup)
 * - "configuration" applies user preferences and profiles
 */
export type BrowserCollectionType = "debloat" | "hardening" | "optimization" | "configuration";

/**
 * Platform entrypoint command: the CLI invocation that performs discovery, preview, apply, or reset.
 * Example: "python3 slimbrave-mac.py", "npm run hardener.apply"
 */
export interface PlatformEntrypoint {
  /** Command to run for the given platform, like "python3 slimbrave-mac.py" */
  readonly command: string;

  /** Whether this platform supports --preview mode (read-only preview without side effects) */
  readonly supportsPreview: boolean;

  /** Whether this platform supports --format json output */
  readonly supportsJson: boolean;

  /** Whether this platform entrypoint requires elevation/admin */
  readonly requiresElevation: boolean;
}

/**
 * Platform-specific capabilities and limits.
 */
export interface PlatformCapabilities {
  readonly platform: Platform;

  /** Entrypoint to discover/apply policies */
  readonly entrypoint: PlatformEntrypoint;

  /** List of DNS modes supported on this platform */
  readonly supportedDnsModes: readonly DNSMode[];

  /** Maximum number of policies this platform can enforce */
  readonly maxPolicies: number;

  /** Whether this platform supports persistent profile installation */
  readonly supportsProfilePersistence: boolean;

  /** Version of the managed policies API like "v1" or "v2" */
  readonly policiesVersion: string;
}

/**
 * Preset: a named, versioned configuration that can be applied to a browser.
 * Presets are immutable snapshots, each with a stable, deterministic ID.
 */
export interface PresetMetadata {
  /** Unique, stable identifier for this preset */
  readonly id: PresetId;

  /** Human-readable name displayed in UI */
  readonly name: string;

  /** Detailed description of what this preset does */
  readonly description: string;

  /** Relative path to the preset file like "Presets/Maximum Privacy Preset.json" */
  readonly filePath: string;

  /** Number of policies in this preset */
  readonly policyCount: number;

  /** List of DNS modes configured by this preset */
  readonly dnsModes: readonly DNSMode[];

  /** Platforms this preset is compatible with */
  readonly compatiblePlatforms: readonly Platform[];

  /** Risk level: "low" (safe defaults), "medium" (may break some features), "high" (strict hardening) */
  readonly riskLevel: "low" | "medium" | "high";

  /** Semantic version of this preset like "1.0.0" or "2.1.3" */
  readonly version: string;

  /** ISO 8601 timestamp when this preset was last updated */
  readonly lastModified: string;
}

/**
 * Collection metadata: top-level identification, versioning, and capabilities.
 * Returned by discovery endpoints like slimbrave_catalog.py --format json.
 */
export interface CollectionMetadata {
  /** Schema version for backwards compatibility */
  readonly schemaVersion: SchemaVersion;

  /** Unique, stable tool ID */
  readonly toolId: ToolId;

  /** Human-readable tool name */
  readonly toolName: string;

  /** URL or reference to the tool's homepage */
  readonly toolUrl: string;

  /** Semantic version of the tool like "3.0.0" */
  readonly toolVersion: string;

  /** Type of collection (debloat, hardening, optimization, configuration) */
  readonly collectionType: BrowserCollectionType;

  /** Platform-specific capabilities and entrypoints */
  readonly platformCapabilities: readonly PlatformCapabilities[];

  /** All presets available in this collection */
  readonly presets: readonly PresetMetadata[];

  /** Human-readable summary of the tool's purpose */
  readonly summary: string;

  /** ISO 8601 timestamp of when this collection was generated */
  readonly generatedAt: string;
}

/**
 * Preview output: a read-only summary of what a preset would change (without applying).
 * Returned by entrypoints with --preview and --format json.
 */
export interface PreviewOutput {
  /** Whether this preview represents an actual system-wide change (false for preview) */
  readonly mutatesSystem: false;

  /** Preset being previewed */
  readonly preset: PresetMetadata;

  /** Platform this preview was generated for */
  readonly platform: Platform;

  /** Summary of policy changes: new, modified, and removed */
  readonly changes: {
    readonly added: readonly string[];
    readonly modified: readonly string[];
    readonly removed: readonly string[];
  };

  /** Total number of policies affected */
  readonly affectedPolicyCount: number;

  /** DNS mode changes, if any */
  readonly dnsChanges?: {
    readonly from: DNSMode;
    readonly to: DNSMode;
  };

  /** Estimated risk or impact level */
  readonly impactLevel: "low" | "medium" | "high";

  /** ISO 8601 timestamp when this preview was generated */
  readonly generatedAt: string;
}

/**
 * Discovery result: the immutable, deterministic response from querying a tool collection.
 * Used to populate launcher UIs and guide safe execution workflows.
 */
export interface DiscoveryResult {
  readonly metadata: CollectionMetadata;

  /** Filtered platform capabilities for the current runtime */
  readonly currentPlatform: PlatformCapabilities;

  /** Presets compatible with the current platform, sorted by risk level */
  readonly compatiblePresets: readonly PresetMetadata[];
}

/**
 * Brand creator functions to satisfy TypeScript's branded type requirements.
 * Use these to create branded strings safely.
 */
export const createSchemaVersion = (version: string): SchemaVersion => {
  return version as SchemaVersion;
};

export const createToolId = (id: string): ToolId => {
  return id as ToolId;
};

export const createPresetId = (id: string): PresetId => {
  return id as PresetId;
};

/**
 * Type guard functions for runtime validation.
 */
export const isPlatform = (value: unknown): value is Platform => {
  return typeof value === "string" && ["linux", "darwin", "win32"].includes(value);
};

export const isDNSMode = (value: unknown): value is DNSMode => {
  return typeof value === "string" &&
    ["default", "strict", "quad9", "opendns", "custom"].includes(value);
};

export const isBrowserCollectionType = (value: unknown): value is BrowserCollectionType => {
  return typeof value === "string" &&
    ["debloat", "hardening", "optimization", "configuration"].includes(value);
};

export const isRiskLevel = (value: unknown): value is "low" | "medium" | "high" => {
  return typeof value === "string" && ["low", "medium", "high"].includes(value);
};
