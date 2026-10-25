import { describe, expect, it } from "vitest";
import { POSTHOG_HOST, POSTHOG_KEY } from "./config";
import {
  mayLoad,
  platformLabel,
  sanitizeEvent,
  versionLabel,
  withDistinctId,
  type LoadGate,
} from "./privacy";

const BUY = "https://licensing.cohencool.workers.dev/buy/spiral";
const RESEND = "https://licensing.cohencool.workers.dev/resend";

const open: LoadGate = {
  key: "phc_test",
  optedOut: false,
  doNotTrack: null,
  globalPrivacyControl: false,
  testRun: false,
};

describe("analytics gates", () => {
  it("loads only when every gate is open", () => {
    expect(mayLoad(open)).toBe(true);
    expect(mayLoad({ ...open, key: "" })).toBe(false);
    expect(mayLoad({ ...open, optedOut: true })).toBe(false);
    expect(mayLoad({ ...open, doNotTrack: "1" })).toBe(false);
    expect(mayLoad({ ...open, globalPrivacyControl: true })).toBe(false);
    expect(mayLoad({ ...open, testRun: true })).toBe(false);
  });

  it("ships an empty or phc_ project key and the US host", () => {
    expect(POSTHOG_KEY).toMatch(/^(phc_[A-Za-z0-9_-]+)?$/);
    expect(POSTHOG_HOST).toBe("https://us.i.posthog.com");
    expect(POSTHOG_KEY).not.toContain("phx_");
  });

  it("names macOS and Windows, and appends a build number when one exists", () => {
    expect(platformLabel("macos", "Windows")).toBe("macOS");
    expect(platformLabel("windows", "")).toBe("Windows");
    expect(platformLabel(null, "Mozilla/5.0 (Windows NT 10.0)")).toBe("Windows");
    expect(platformLabel(null, "Mozilla/5.0 (Macintosh)")).toBe("macOS");
    expect(versionLabel("2.0.0", null)).toBe("2.0.0");
    expect(versionLabel("2.0.0", "2.0.0")).toBe("2.0.0");
    expect(versionLabel("2.0.0", "42")).toBe("2.0.0 (42)");
  });

  it("adds ph on a buy link only when analytics is on", () => {
    expect(withDistinctId(BUY, "anon-id", true)).toBe(`${BUY}?ph=anon-id`);
    expect(withDistinctId(BUY, "anon-id", false)).toBe(BUY);
    expect(withDistinctId(BUY, "not valid", true)).toBe(BUY);
    expect(withDistinctId(RESEND, "anon-id", true)).toBe(RESEND);
  });

  it("replaces url properties with the route and drops everything else", () => {
    const out = sanitizeEvent(
      {
        event: "picker_opened",
        properties: {
          $current_url: "https://tauri.localhost/index.html?q=secret@x.com",
          $pathname: "/index.html",
          $referrer: "https://example.com/from",
          $host: "tauri.localhost",
          $lib: "web",
          email: "a@b.c",
          token: "phc_test",
          distinct_id: "anon-id",
          app: "spiral",
          platform: "macOS",
          version: "2.0.0",
        },
        $set: { $os: "Mac OS X" },
      },
      "settings",
    );
    expect(out?.properties).toEqual({
      $current_url: "settings",
      $pathname: "settings",
      $referrer: "settings",
      $host: "settings",
      token: "phc_test",
      distinct_id: "anon-id",
      app: "spiral",
      platform: "macOS",
      version: "2.0.0",
      $geoip_disable: true,
    });
    expect(out?.$set).toBeUndefined();
  });
});
