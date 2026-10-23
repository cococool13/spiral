import { POSTHOG_HOST, POSTHOG_KEY } from "./config";
import {
  isLicensingBuyUrl,
  mayLoad,
  platformLabel,
  readDoNotTrack,
  readGlobalPrivacyControl,
  sanitizeEvent,
  versionLabel,
  withDistinctId,
  type Activation,
  type AnalyticsRoute,
  type ToolName,
} from "./privacy";

export type { Activation, AnalyticsRoute, ToolName } from "./privacy";
export { withDistinctId } from "./privacy";

const ACTIVATED_KEY = "spiral.activated";

type AnalyticsEvent =
  | { name: "picker_opened" }
  | { name: "tool_chosen"; tool: ToolName }
  | { name: "activated"; activation: Activation };

interface Sdk {
  register: (properties: Record<string, string>) => void;
  capture: (event: string, properties?: Record<string, unknown>) => void;
  opt_out_capturing: () => void;
  opt_in_capturing: (options?: { captureEventName?: false }) => void;
  has_opted_out_capturing: () => boolean;
  get_distinct_id: () => string;
}

export interface BeginInput {
  optedOut: boolean;
  platform: "macos" | "windows";
  fallbackVersion: string;
  route: AnalyticsRoute;
  testRun?: boolean;
}

type Phase = "pending" | "live" | "off";

let phase: Phase = "pending";
let sharing = true;
let userChose: boolean | null = null;
let sdk: Sdk | null = null;
let currentRoute: AnalyticsRoute = "picker";
let memoryActivation: Activation | null = null;
let loadOnce: Promise<void> | null = null;
let lastInput: BeginInput | null = null;
const queue: AnalyticsEvent[] = [];

let readySettled = false;
let resolveReady: () => void = () => undefined;
let ready = new Promise<void>((resolve) => {
  resolveReady = () => {
    if (readySettled) return;
    readySettled = true;
    resolve();
  };
});

function settleReady(): void {
  resolveReady();
}

function armReady(): void {
  if (!readySettled) return;
  readySettled = false;
  ready = new Promise<void>((resolve) => {
    resolveReady = () => {
      if (readySettled) return;
      readySettled = true;
      resolve();
    };
  });
}

function props(event: AnalyticsEvent): Record<string, string> {
  switch (event.name) {
    case "picker_opened":
      return {};
    case "tool_chosen":
      return { tool: event.tool };
    case "activated":
      return { activation: event.activation };
  }
}

function track(event: AnalyticsEvent): void {
  if (!sharing || phase === "off") return;
  if (phase === "live" && sdk) {
    try {
      sdk.capture(event.name, props(event));
    } catch {
      return;
    }
    return;
  }
  queue.push(event);
}

function flush(): void {
  if (!sdk || phase !== "live" || !sharing) return;
  const pending = queue.splice(0);
  for (const event of pending) {
    try {
      sdk.capture(event.name, props(event));
    } catch {
      return;
    }
  }
}

function rememberActivation(activation: Activation): boolean {
  if (memoryActivation) return false;
  try {
    const stored = localStorage.getItem(ACTIVATED_KEY);
    if (stored === "first_wallpaper_applied" || stored === "first_resume_exported") {
      memoryActivation = stored;
      return false;
    }
    localStorage.setItem(ACTIVATED_KEY, activation);
  } catch {
    memoryActivation = activation;
    return true;
  }
  memoryActivation = activation;
  return true;
}

function noteActivation(activation: Activation): void {
  if (!rememberActivation(activation)) return;
  track({ name: "activated", activation });
}

export function setAnalyticsRoute(route: AnalyticsRoute): void {
  currentRoute = route;
}

export function notePickerOpened(): void {
  track({ name: "picker_opened" });
}

export function noteToolChosen(tool: ToolName): void {
  track({ name: "tool_chosen", tool });
}

export function noteWallpaperApplied(): void {
  noteActivation("first_wallpaper_applied");
}

export function noteResumeExported(): void {
  noteActivation("first_resume_exported");
}

function gateFor(input: BeginInput) {
  return {
    key: POSTHOG_KEY,
    optedOut: input.optedOut,
    doNotTrack: readDoNotTrack(navigator),
    globalPrivacyControl: readGlobalPrivacyControl(navigator),
    testRun: input.testRun ?? import.meta.env.MODE === "test",
  };
}

async function readVersion(fallback: string): Promise<string> {
  try {
    const app = await import("@tauri-apps/api/app");
    const version = (await app.getVersion()).trim();
    if (version.length > 0) return versionLabel(version, null);
  } catch {
    return versionLabel(fallback, null);
  }
  return versionLabel(fallback, null);
}

function bind(instance: Sdk, label: string, version: string): void {
  sdk = instance;
  instance.register({ app: "spiral", platform: label, version });
  if (!sharing) {
    queue.length = 0;
    phase = "off";
    instance.opt_out_capturing();
    return;
  }
  if (instance.has_opted_out_capturing()) {
    instance.opt_in_capturing({ captureEventName: false });
  }
  phase = "live";
  flush();
}

async function startSdk(input: BeginInput): Promise<void> {
  const versionPromise = readVersion(input.fallbackVersion);
  const loaded = await import("posthog-js");
  const version = await versionPromise;
  const label = platformLabel(input.platform, navigator.userAgent);
  await new Promise<void>((resolve) => {
    let opened = false;
    loaded.default.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: "identified_only",
      persistence: "localStorage",
      respect_dnt: true,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
      capture_exceptions: false,
      disable_external_dependency_loading: true,
      before_send: (event) => sanitizeEvent(event, currentRoute),
      loaded: (instance) => {
        opened = true;
        bind(instance, label, version);
        resolve();
      },
    });
    if (!opened) {
      phase = "off";
      queue.length = 0;
      loadOnce = null;
      resolve();
    }
  });
}

export function begin(input: BeginInput): Promise<void> {
  lastInput = input;
  currentRoute = input.route;
  const allowed = userChose !== false && mayLoad(gateFor(input));
  if (!allowed) {
    sharing = false;
    queue.length = 0;
    phase = "off";
    settleReady();
    return Promise.resolve();
  }
  sharing = true;
  phase = "pending";
  if (loadOnce) return loadOnce;
  armReady();
  loadOnce = startSdk(input)
    .catch(() => {
      phase = "off";
      queue.length = 0;
      loadOnce = null;
    })
    .finally(() => {
      settleReady();
    });
  return loadOnce;
}

export function setSharing(share: boolean): void {
  userChose = share;
  sharing = share;
  if (!share) {
    queue.length = 0;
    if (phase === "live") phase = "off";
    sdk?.opt_out_capturing();
    return;
  }
  if (sdk) {
    phase = "live";
    sdk.opt_in_capturing({ captureEventName: false });
    return;
  }
  if (lastInput) {
    void begin({ ...lastInput, optedOut: false });
  }
}

export function checkoutUrl(url: string): Promise<string> {
  if (!isLicensingBuyUrl(url)) return Promise.resolve(url);
  if (phase === "live" && sharing && sdk) {
    return Promise.resolve(withDistinctId(url, sdk.get_distinct_id(), true));
  }
  if (phase === "off" || !sharing) return Promise.resolve(url);
  const wait = Promise.race([
    ready,
    new Promise<void>((resolve) => {
      setTimeout(resolve, 2000);
    }),
  ]);
  return wait.then(() => {
    if (phase !== "live" || !sharing || !sdk) return url;
    return withDistinctId(url, sdk.get_distinct_id(), true);
  });
}
