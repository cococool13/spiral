import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BeginInput } from "./client";

const sdk = vi.hoisted(() => ({
  loads: 0,
  init: vi.fn(),
  register: vi.fn(),
  capture: vi.fn(),
  opt_out_capturing: vi.fn(),
  opt_in_capturing: vi.fn(),
  has_opted_out_capturing: vi.fn(() => false),
  get_distinct_id: vi.fn(() => "anon-id"),
  identify: vi.fn(),
}));

vi.mock("./config", () => ({
  POSTHOG_KEY: "phc_test",
  POSTHOG_HOST: "https://us.i.posthog.com",
}));

vi.mock("posthog-js", () => {
  sdk.loads += 1;
  return { default: sdk };
});

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(async () => "2.0.0"),
}));

const BUY = "https://licensing.cohencool.workers.dev/buy/spiral";
const RESEND = "https://licensing.cohencool.workers.dev/resend";

const input: BeginInput = {
  optedOut: false,
  platform: "macos",
  fallbackVersion: "2.0.0",
  route: "picker",
  testRun: false,
};

function setNav(doNotTrack: string | null, gpc = false) {
  Object.defineProperty(navigator, "doNotTrack", {
    configurable: true,
    get: () => doNotTrack,
  });
  Object.defineProperty(navigator, "globalPrivacyControl", {
    configurable: true,
    get: () => gpc,
  });
}

function installStorage(): void {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? (data.get(key) ?? null) : null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
  vi.stubGlobal("localStorage", storage);
}

async function loadClient() {
  vi.resetModules();
  installStorage();
  sdk.loads = 0;
  sdk.init.mockReset();
  sdk.register.mockReset();
  sdk.capture.mockReset();
  sdk.opt_out_capturing.mockReset();
  sdk.opt_in_capturing.mockReset();
  sdk.has_opted_out_capturing.mockReset();
  sdk.has_opted_out_capturing.mockReturnValue(false);
  sdk.get_distinct_id.mockReset();
  sdk.get_distinct_id.mockReturnValue("anon-id");
  sdk.identify.mockReset();
  sdk.init.mockImplementation((_key: string, config: { loaded?: (instance: typeof sdk) => void }) => {
    config.loaded?.(sdk);
  });
  setNav(null);
  return import("./client");
}

describe("posthog client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("does not import posthog when opted out, DNT, GPC, or a test run", async () => {
    const runs = [
      async () => {
        const client = await loadClient();
        await client.begin({ ...input, optedOut: true });
      },
      async () => {
        const client = await loadClient();
        await client.begin({ ...input, testRun: true });
      },
      async () => {
        const client = await loadClient();
        setNav("1");
        await client.begin(input);
      },
      async () => {
        const client = await loadClient();
        setNav(null, true);
        await client.begin(input);
      },
    ];
    for (const run of runs) {
      await run();
      expect(sdk.loads).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it("registers spiral, macOS, and the app version", async () => {
    const client = await loadClient();
    await client.begin(input);
    expect(sdk.loads).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sdk.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        api_host: "https://us.i.posthog.com",
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
      }),
    );
    expect(sdk.register).toHaveBeenCalledWith({
      app: "spiral",
      platform: "macOS",
      version: "2.0.0",
    });
    expect(sdk.identify).not.toHaveBeenCalled();
    const config = sdk.init.mock.calls[0]?.[1] as {
      before_send: (event: {
        event: string;
        properties: Record<string, unknown>;
        $set?: unknown;
      }) => { properties?: Record<string, unknown>; $set?: unknown } | null;
    };
    const out = config.before_send({
      event: "picker_opened",
      properties: {
        $current_url: "https://tauri.localhost/?q=secret",
        $pathname: "/index.html",
        $referrer: "https://example.com/a",
        $host: "tauri.localhost",
        email: "a@b.c",
        token: "phc_test",
      },
      $set: { $browser: "WebKit" },
    });
    expect(out?.properties?.$current_url).toBe("picker");
    expect(out?.properties?.$pathname).toBe("picker");
    expect(out?.properties?.$referrer).toBe("picker");
    expect(out?.properties?.$host).toBe("picker");
    expect(out?.properties?.email).toBeUndefined();
    expect(out?.properties?.token).toBe("phc_test");
    expect(out?.properties?.$geoip_disable).toBe(true);
    expect(out?.$set).toBeUndefined();
  });

  it("uses Windows when the boot platform is windows", async () => {
    const client = await loadClient();
    await client.begin({ ...input, platform: "windows" });
    expect(sdk.register).toHaveBeenCalledWith({
      app: "spiral",
      platform: "Windows",
      version: "2.0.0",
    });
  });

  it("sends activated once, for whichever value happens first", async () => {
    const first = await loadClient();
    await first.begin(input);
    first.noteWallpaperApplied();
    first.noteWallpaperApplied();
    first.noteResumeExported();
    expect(sdk.capture).toHaveBeenCalledTimes(1);
    expect(sdk.capture).toHaveBeenCalledWith("activated", {
      activation: "first_wallpaper_applied",
    });

    const second = await loadClient();
    second.noteResumeExported();
    await second.begin(input);
    second.noteWallpaperApplied();
    expect(sdk.capture).toHaveBeenCalledTimes(1);
    expect(sdk.capture).toHaveBeenCalledWith("activated", {
      activation: "first_resume_exported",
    });
  });

  it("adds ph only while capturing is on", async () => {
    const client = await loadClient();
    await client.begin(input);
    await expect(client.checkoutUrl(BUY)).resolves.toBe(`${BUY}?ph=anon-id`);
    await expect(client.checkoutUrl(RESEND)).resolves.toBe(RESEND);
    client.setSharing(false);
    await expect(client.checkoutUrl(BUY)).resolves.toBe(BUY);
    expect(sdk.opt_out_capturing).toHaveBeenCalled();
    client.notePickerOpened();
    client.noteToolChosen("wallpaper");
    expect(sdk.capture).not.toHaveBeenCalled();
  });
});
