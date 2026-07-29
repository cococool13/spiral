/**
 * The key App.tsx uses to decide what to fetch for the review screen.
 *
 * Regression: the effect was previously keyed on a predicate that included
 * `busy`. Dispatching `preview.loading` flipped that predicate, changed the
 * effect's dependencies, ran its cleanup, and cancelled the request it had
 * just started. `busy` never cleared and the review screen loaded forever.
 *
 * The first test below is that bug, stated directly.
 */
import { describe, expect, it } from "vitest";

import { initialState, previewRequestKey } from "../src/lib/wizard";
import { catalog, detection, outcome, preview, run } from "./fixtures";

function onReview() {
  return run(
    initialState,
    { type: "detection.loaded", report: detection() },
    { type: "catalog.loaded", catalog: catalog() },
    { type: "channel.toggled", channelId: "beta" }, // stable only
    { type: "step.next" },
    { type: "step.next" },
  );
}

const ERROR = {
  title: "Could not review the changes",
  detail: "python3 exited with status 2.",
  nextStep: "Go back and try again.",
};

describe("the request key never cancels its own request", () => {
  it("does NOT change when the machine becomes busy", () => {
    // The regression, stated directly. If this fails, the review screen
    // hangs on "working out exactly what would change" forever.
    const idle = onReview();
    const loading = run(idle, { type: "preview.loading" });
    expect(loading.busy).toBe("preview");
    expect(previewRequestKey(loading)).toBe(previewRequestKey(idle));
  });

  it("does NOT change when the preview lands", () => {
    const idle = onReview();
    const loaded = run(
      idle,
      { type: "preview.loading" },
      { type: "preview.loaded", report: preview() },
    );
    expect(previewRequestKey(loaded)).toBe(previewRequestKey(idle));
  });

  it("does NOT change when the preview fails", () => {
    const idle = onReview();
    const failed = run(
      idle,
      { type: "preview.loading" },
      { type: "preview.failed", error: ERROR },
    );
    expect(previewRequestKey(failed)).toBe(previewRequestKey(idle));
  });

  it("does NOT change when the confirmation is ticked", () => {
    const idle = run(onReview(), { type: "preview.loaded", report: preview() });
    const confirmed = run(idle, { type: "confirmation.set", confirmed: true });
    expect(previewRequestKey(confirmed)).toBe(previewRequestKey(idle));
  });
});

describe("the request key changes when the request should change", () => {
  it("is null before the review step", () => {
    expect(previewRequestKey(initialState)).toBeNull();
    const onProfile = run(
      initialState,
      { type: "detection.loaded", report: detection() },
      { type: "catalog.loaded", catalog: catalog() },
      { type: "step.next" },
    );
    expect(previewRequestKey(onProfile)).toBeNull();
  });

  it("is non-null on the review step", () => {
    expect(previewRequestKey(onReview())).not.toBeNull();
  });

  it("changes when the profile changes", () => {
    const before = onReview();
    const after = run(before, {
      type: "profile.selected",
      profileId: "maximum-performance",
    });
    expect(previewRequestKey(after)).not.toBe(previewRequestKey(before));
  });

  it("changes when the channel selection changes", () => {
    const before = onReview();
    const after = run(before, { type: "channel.toggled", channelId: "beta" });
    expect(previewRequestKey(after)).not.toBe(previewRequestKey(before));
  });

  it("changes when switching to a custom selection", () => {
    const before = onReview();
    const after = run(before, { type: "custom.selected" });
    expect(previewRequestKey(after)).not.toBe(previewRequestKey(before));
  });

  it("changes when a custom module is toggled", () => {
    const before = run(onReview(), { type: "custom.selected" });
    const after = run(before, {
      type: "custom.moduleToggled",
      moduleId: "quiet-web",
    });
    expect(previewRequestKey(after)).not.toBe(previewRequestKey(before));
  });

  it("changes when a custom control is excluded", () => {
    const before = run(onReview(), { type: "custom.selected" });
    const after = run(before, {
      type: "custom.controlToggled",
      controlId: "telemetry.metrics",
    });
    expect(previewRequestKey(after)).not.toBe(previewRequestKey(before));
  });

  it("ignores the order of the channel selection", () => {
    const a = { ...onReview(), selectedChannelIds: ["stable", "beta"] };
    const b = { ...onReview(), selectedChannelIds: ["beta", "stable"] };
    expect(previewRequestKey(a)).toBe(previewRequestKey(b));
  });

  it("ignores the order of custom modules and exclusions", () => {
    const base = run(onReview(), { type: "custom.selected" });
    const a = {
      ...base,
      customDraft: {
        moduleIds: ["security-foundation", "quiet-web"],
        excludedControlIds: ["media.autoplay", "telemetry.metrics"],
      },
    };
    const b = {
      ...base,
      customDraft: {
        moduleIds: ["quiet-web", "security-foundation"],
        excludedControlIds: ["telemetry.metrics", "media.autoplay"],
      },
    };
    expect(previewRequestKey(a)).toBe(previewRequestKey(b));
  });

  it("goes null and back when stepping away and returning, which is the retry", () => {
    // A failed review keeps the same key, so nothing re-fires on its own.
    // Navigating away nulls the key; coming back changes it null -> key,
    // which is what re-runs the effect.
    const failed = run(
      onReview(),
      { type: "preview.loading" },
      { type: "preview.failed", error: ERROR },
    );
    const away = run(failed, { type: "step.back" });
    expect(previewRequestKey(away)).toBeNull();
    const back = run(away, { type: "step.next" });
    expect(previewRequestKey(back)).toBe(previewRequestKey(failed));
  });

  it("is null once the wizard finishes", () => {
    const done = run(onReview(), {
      type: "apply.succeeded",
      outcome: outcome(),
    });
    expect(previewRequestKey(done)).toBeNull();
  });
});
