/**
 * Custom selections are held to the same two rules as bundled profiles.
 *
 * The dangerous case is specific to custom: every custom preview comes back
 * with profileId "custom", so an id comparison alone would let a review of
 * one selection authorise a completely different one. These tests attack
 * that directly.
 */
import { describe, expect, it } from "vitest";

import {
  canAdvance,
  canApply,
  canPreview,
  customDraftProblem,
  draftControlIds,
  initialState,
  previewMatchesSelection,
  reduce,
  requiredControlIds,
} from "../src/lib/wizard";
import {
  RECOMMENDED_CONTROLS,
  catalog,
  customPreview,
  detection,
  run,
} from "./fixtures";

/** On the review step with Custom selected and its default draft. */
function onCustomReview() {
  return run(
    initialState,
    { type: "detection.loaded", report: detection() },
    { type: "catalog.loaded", catalog: catalog() },
    { type: "channel.toggled", channelId: "beta" }, // stable only
    { type: "custom.selected" },
    { type: "step.next" },
    { type: "step.next" },
  );
}

describe("the custom draft", () => {
  it("is seeded from the recommended profile's modules", () => {
    const state = reduce(initialState, {
      type: "catalog.loaded",
      catalog: catalog(),
    });
    expect(state.customDraft.moduleIds).toEqual([
      "security-foundation",
      "privacy-balanced",
    ]);
    expect(state.customDraft.excludedControlIds).toEqual([]);
  });

  it("resolves to the union of its modules' controls", () => {
    expect(
      [...draftControlIds(catalog(), {
        moduleIds: ["security-foundation", "privacy-balanced"],
        excludedControlIds: [],
      })].sort(),
    ).toEqual([...RECOMMENDED_CONTROLS].sort());
  });

  it("drops an excluded control from what it resolves to", () => {
    const ids = draftControlIds(catalog(), {
      moduleIds: ["privacy-balanced"],
      excludedControlIds: ["telemetry.metrics"],
    });
    expect(ids).toEqual(["privacy.third-party-cookies"]);
  });

  it("knows which controls its modules require", () => {
    expect(requiredControlIds(catalog(), ["security-foundation"])).toEqual([
      "security.safe-browsing",
    ]);
    expect(requiredControlIds(catalog(), ["quiet-web"])).toEqual([]);
  });

  it("refuses to exclude a required control", () => {
    const state = run(
      initialState,
      { type: "catalog.loaded", catalog: catalog() },
      { type: "custom.selected" },
      { type: "custom.controlToggled", controlId: "security.safe-browsing" },
    );
    expect(state.customDraft.excludedControlIds).toEqual([]);
  });

  it("excludes and restores an optional control", () => {
    const excluded = run(
      initialState,
      { type: "catalog.loaded", catalog: catalog() },
      { type: "custom.selected" },
      { type: "custom.controlToggled", controlId: "telemetry.metrics" },
    );
    expect(excluded.customDraft.excludedControlIds).toEqual([
      "telemetry.metrics",
    ]);
    const restored = reduce(excluded, {
      type: "custom.controlToggled",
      controlId: "telemetry.metrics",
    });
    expect(restored.customDraft.excludedControlIds).toEqual([]);
  });

  it("forgets an exclusion when its module is removed", () => {
    // Otherwise the stale id would make the draft unresolvable if the
    // module were added back.
    const state = run(
      initialState,
      { type: "catalog.loaded", catalog: catalog() },
      { type: "custom.selected" },
      { type: "custom.controlToggled", controlId: "telemetry.metrics" },
      { type: "custom.moduleToggled", moduleId: "privacy-balanced" },
    );
    expect(state.customDraft.moduleIds).toEqual(["security-foundation"]);
    expect(state.customDraft.excludedControlIds).toEqual([]);
  });

  it("reports an empty module selection as a problem", () => {
    expect(
      customDraftProblem(catalog(), { moduleIds: [], excludedControlIds: [] }),
    ).toContain("at least one part");
  });

  it("reports excluding everything as a problem", () => {
    expect(
      customDraftProblem(catalog(), {
        moduleIds: ["quiet-web"],
        excludedControlIds: [
          "permissions.notifications.default",
          "media.autoplay",
        ],
      }),
    ).toContain("would apply nothing");
  });

  it("blocks advancing while the draft is unusable", () => {
    const state = run(
      initialState,
      { type: "detection.loaded", report: detection() },
      { type: "catalog.loaded", catalog: catalog() },
      { type: "step.next" },
      { type: "custom.selected" },
      { type: "custom.moduleToggled", moduleId: "security-foundation" },
      { type: "custom.moduleToggled", moduleId: "privacy-balanced" },
    );
    expect(state.customDraft.moduleIds).toEqual([]);
    expect(canAdvance(state).ok).toBe(false);
    expect(canPreview(state).ok).toBe(false);
  });
});

describe("a custom preview binds to the exact draft", () => {
  it("matches when the preview contains exactly the draft's controls", () => {
    const state = reduce(onCustomReview(), {
      type: "preview.loaded",
      report: customPreview(RECOMMENDED_CONTROLS),
    });
    expect(previewMatchesSelection(state)).toBe(true);
    expect(canApply(reduce(state, {
      type: "confirmation.set",
      confirmed: true,
    }))).toEqual({ ok: true, reason: "" });
  });

  it("refuses a preview of a wider selection", () => {
    // Same profileId "custom", more controls: an id check would pass this.
    const state = reduce(onCustomReview(), {
      type: "preview.loaded",
      report: customPreview([...RECOMMENDED_CONTROLS, "media.autoplay"]),
    });
    expect(previewMatchesSelection(state)).toBe(false);
    expect(canApply(state).reason).toContain("selection changed");
  });

  it("refuses a preview of a narrower selection", () => {
    const state = reduce(onCustomReview(), {
      type: "preview.loaded",
      report: customPreview(RECOMMENDED_CONTROLS.slice(1)),
    });
    expect(previewMatchesSelection(state)).toBe(false);
  });

  it("refuses a bundled preview while Custom is selected", () => {
    const state = reduce(onCustomReview(), {
      type: "preview.loaded",
      report: customPreview(RECOMMENDED_CONTROLS, {
        profileId: "balanced-daily",
      }),
    });
    expect(previewMatchesSelection(state)).toBe(false);
  });

  it("refuses a custom preview while a bundled profile is selected", () => {
    const state = run(
      initialState,
      { type: "detection.loaded", report: detection() },
      { type: "catalog.loaded", catalog: catalog() },
      { type: "channel.toggled", channelId: "beta" },
      { type: "step.next" },
      { type: "step.next" },
      { type: "preview.loaded", report: customPreview(RECOMMENDED_CONTROLS) },
    );
    expect(state.selection).toEqual({
      kind: "bundled",
      profileId: "balanced-daily",
    });
    expect(previewMatchesSelection(state)).toBe(false);
  });

  it("discards the preview when a module is toggled", () => {
    const state = run(
      onCustomReview(),
      { type: "preview.loaded", report: customPreview(RECOMMENDED_CONTROLS) },
      { type: "confirmation.set", confirmed: true },
      { type: "custom.moduleToggled", moduleId: "quiet-web" },
    );
    expect(state.preview).toBeNull();
    expect(state.confirmed).toBe(false);
  });

  it("discards the preview when a control is excluded", () => {
    const state = run(
      onCustomReview(),
      { type: "preview.loaded", report: customPreview(RECOMMENDED_CONTROLS) },
      { type: "confirmation.set", confirmed: true },
      { type: "custom.controlToggled", controlId: "telemetry.metrics" },
    );
    expect(state.preview).toBeNull();
    expect(state.confirmed).toBe(false);
  });

  it("keeps the preview when a refused toggle changes nothing", () => {
    // Toggling a required control is a no-op, so it must not invalidate.
    const state = run(
      onCustomReview(),
      { type: "preview.loaded", report: customPreview(RECOMMENDED_CONTROLS) },
      { type: "confirmation.set", confirmed: true },
      { type: "custom.controlToggled", controlId: "security.safe-browsing" },
    );
    expect(state.preview).not.toBeNull();
    expect(state.confirmed).toBe(true);
  });

  it("cannot be confirmed when the draft and preview disagree", () => {
    const state = run(
      onCustomReview(),
      { type: "preview.loaded", report: customPreview(["media.autoplay"]) },
      { type: "confirmation.set", confirmed: true },
    );
    expect(state.confirmed).toBe(false);
  });

  it("cannot match without a catalog to resolve the draft against", () => {
    const base = reduce(onCustomReview(), {
      type: "preview.loaded",
      report: customPreview(RECOMMENDED_CONTROLS),
    });
    expect(previewMatchesSelection({ ...base, catalog: null })).toBe(false);
  });

  it("still requires the channel set to match", () => {
    const state = reduce(onCustomReview(), {
      type: "preview.loaded",
      report: customPreview(RECOMMENDED_CONTROLS, {
        channelIds: ["stable", "beta"],
      }),
    });
    expect(previewMatchesSelection(state)).toBe(false);
  });
});

describe("switching between bundled and custom", () => {
  it("keeps the draft when a bundled profile is chosen", () => {
    const state = run(
      initialState,
      { type: "catalog.loaded", catalog: catalog() },
      { type: "custom.selected" },
      { type: "custom.moduleToggled", moduleId: "quiet-web" },
      { type: "profile.selected", profileId: "maximum-performance" },
    );
    expect(state.selection).toEqual({
      kind: "bundled",
      profileId: "maximum-performance",
    });
    expect(state.customDraft.moduleIds).toContain("quiet-web");
  });

  it("invalidates the review when switching to custom", () => {
    const state = run(
      initialState,
      { type: "detection.loaded", report: detection() },
      { type: "catalog.loaded", catalog: catalog() },
      { type: "channel.toggled", channelId: "beta" },
      { type: "step.next" },
      { type: "step.next" },
      { type: "preview.loaded", report: customPreview(RECOMMENDED_CONTROLS, {
        profileId: "balanced-daily",
      }) },
      { type: "confirmation.set", confirmed: true },
      { type: "custom.selected" },
    );
    expect(state.preview).toBeNull();
    expect(state.confirmed).toBe(false);
  });

  it("is a no-op when custom is already selected", () => {
    const base = run(
      initialState,
      { type: "catalog.loaded", catalog: catalog() },
      { type: "custom.selected" },
    );
    expect(reduce(base, { type: "custom.selected" })).toBe(base);
  });
});
