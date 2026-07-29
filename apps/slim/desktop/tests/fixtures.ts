import type {
  ApplyOutcome,
  DetectionReport,
  PreviewReport,
  ProfileCatalog,
} from "../src/lib/contract";
import { reduce, type WizardEvent, type WizardState } from "../src/lib/wizard";

export const HASH_A =
  "1111111111111111111111111111111111111111111111111111111111111111";
export const HASH_B =
  "2222222222222222222222222222222222222222222222222222222222222222";

/** A one-pixel transparent PNG, shaped like the real icon payload. */
export const ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export function detection(
  overrides: Partial<DetectionReport> = {},
): DetectionReport {
  return {
    platform: "macos",
    found: true,
    method: "macOS App",
    warnings: [],
    persistence: {
      supportedModes: ["off", "on"],
      mode: "off",
      profileInstalled: false,
    },
    channels: [
      {
        id: "stable",
        label: "Stable",
        appPath: "/Applications/Brave Browser.app",
        bundleId: "com.brave.Browser",
        policyPath: "/Library/Managed Preferences/com.brave.Browser.plist",
        running: false,
        managedPolicyCount: 50,
        icon: ICON,
      },
      {
        id: "beta",
        label: "Beta",
        appPath: "/Applications/Brave Browser Beta.app",
        bundleId: "com.brave.Browser.beta",
        policyPath: "/Library/Managed Preferences/com.brave.Browser.beta.plist",
        running: false,
        managedPolicyCount: 0,
        icon: null,
      },
    ],
    ...overrides,
  };
}

export function catalog(): ProfileCatalog {
  return {
    profiles: [
      {
        id: "balanced-daily",
        name: "Balanced Daily",
        description: "A secure, private, responsive daily configuration.",
        risk: "low",
        modules: ["security-foundation", "privacy-balanced"],
      },
      {
        id: "maximum-performance",
        name: "Maximum Performance",
        description: "Prioritises responsiveness.",
        risk: "medium",
        modules: ["security-foundation", "performance-balanced"],
      },
    ],
    modules: [
      {
        id: "security-foundation",
        name: "Security foundation",
        risk: "low",
        conflictsWith: [],
        controls: [
          { id: "security.safe-browsing", required: true },
          { id: "security.downloads.malicious", required: false },
        ],
      },
      {
        id: "privacy-balanced",
        name: "Balanced privacy",
        risk: "low",
        conflictsWith: [],
        controls: [
          { id: "telemetry.metrics", required: false },
          { id: "privacy.third-party-cookies", required: false },
        ],
      },
      {
        id: "performance-balanced",
        name: "Balanced performance",
        risk: "low",
        conflictsWith: [],
        controls: [
          { id: "performance.background-mode", required: false },
          { id: "performance.memory-saver", required: false },
        ],
      },
      {
        id: "quiet-web",
        name: "Quiet web",
        risk: "medium",
        conflictsWith: [],
        controls: [
          { id: "permissions.notifications.default", required: false },
          { id: "media.autoplay", required: false },
        ],
      },
    ],
  };
}

/** Control ids the recommended profile's modules resolve to. */
export const RECOMMENDED_CONTROLS = [
  "security.safe-browsing",
  "security.downloads.malicious",
  "telemetry.metrics",
  "privacy.third-party-cookies",
];

export function control(id: string) {
  return {
    id,
    vendorName: "MetricsReportingEnabled",
    current: null,
    desired: false,
    action: "add" as const,
    support: "preview_ready" as const,
    required: false,
    reason: "",
  };
}

export function preview(overrides: Partial<PreviewReport> = {}): PreviewReport {
  return {
    profileId: "balanced-daily",
    profileName: "Balanced Daily",
    risk: "low",
    planHash: HASH_A,
    blocked: false,
    managedPolicyCount: 18,
    channelIds: ["stable"],
    controls: [control("telemetry.metrics")],
    targets: [
      {
        label: "Stable",
        path: "/Library/Managed Preferences/com.brave.Browser.plist",
        changes: { add: 5, change: 2, remove: 37, unchanged: 11 },
      },
    ],
    persistence: { mode: "on", profileStatus: "not_detected" },
    ...overrides,
  };
}

/** A preview shaped like one the engine returns for a custom selection. */
export function customPreview(
  controlIds: readonly string[],
  overrides: Partial<PreviewReport> = {},
): PreviewReport {
  return preview({
    profileId: "custom",
    profileName: "Custom",
    planHash: HASH_B,
    controls: controlIds.map(control),
    ...overrides,
  });
}

export function outcome(overrides: Partial<ApplyOutcome> = {}): ApplyOutcome {
  return {
    planHash: HASH_A,
    profileId: "balanced-daily",
    message: "Profile generated to Stable.",
    channelLabels: ["Stable"],
    managedPolicyCount: 18,
    persistMode: "on",
    profileApprovalPending: true,
    braveRunning: false,
    ...overrides,
  };
}

/** Fold a list of events over the machine, starting from a base state. */
export function run(base: WizardState, ...events: WizardEvent[]): WizardState {
  return events.reduce(reduce, base);
}
