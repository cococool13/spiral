/**
 * The two rules that keep Spiral Slim safe, tested directly.
 *
 *   1. A change is previewed before it can be applied.
 *   2. A change is explicitly confirmed before it can be applied.
 *
 * Each is checked against every way it could plausibly be bypassed rather
 * than once down the happy path.
 */
import { describe, expect, it } from "vitest";

import {
  canApply,
  initialState,
  previewMatchesSelection,
  reduce,
} from "../src/lib/wizard";
import { HASH_B, catalog, detection, outcome, preview, run } from "./fixtures";

function confirmedReview() {
  return run(
    initialState,
    { type: "detection.loaded", report: detection() },
    { type: "catalog.loaded", catalog: catalog() },
    { type: "channel.toggled", channelId: "beta" },
    { type: "step.next" },
    { type: "step.next" },
    { type: "preview.loaded", report: preview() },
    { type: "confirmation.set", confirmed: true },
  );
}

describe("preview before apply", () => {
  it("allows apply once a matching preview is confirmed", () => {
    expect(canApply(confirmedReview())).toEqual({ ok: true, reason: "" });
  });

  it("refuses apply when nothing has been previewed", () => {
    const state = { ...confirmedReview(), preview: null };
    const verdict = canApply(state);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("Review the exact changes");
  });

  it("discards the preview when the profile changes", () => {
    const state = reduce(confirmedReview(), {
      type: "profile.selected",
      profileId: "maximum-performance",
    });
    expect(state.preview).toBeNull();
    expect(state.confirmed).toBe(false);
    expect(canApply(state).ok).toBe(false);
  });

  it("discards the preview when the channel selection changes", () => {
    const state = reduce(confirmedReview(), {
      type: "channel.toggled",
      channelId: "beta",
    });
    expect(state.preview).toBeNull();
    expect(state.confirmed).toBe(false);
  });

  it("refuses a preview that describes a different profile", () => {
    const state = {
      ...confirmedReview(),
      preview: preview({ profileId: "maximum-performance", planHash: HASH_B }),
    };
    expect(previewMatchesSelection(state)).toBe(false);
    expect(canApply(state).reason).toContain("selection changed");
  });

  it("refuses a preview that describes a different channel set", () => {
    const state = {
      ...confirmedReview(),
      preview: preview({ channelIds: ["stable", "beta"] }),
    };
    expect(previewMatchesSelection(state)).toBe(false);
    expect(canApply(state).ok).toBe(false);
  });

  it("treats channel order as irrelevant", () => {
    const base = confirmedReview();
    const state = {
      ...base,
      selectedChannelIds: ["beta", "stable"],
      preview: preview({ channelIds: ["stable", "beta"] }),
    };
    expect(previewMatchesSelection(state)).toBe(true);
  });

  it("refuses apply from any step other than review", () => {
    const state = { ...confirmedReview(), step: "profile" as const };
    expect(canApply(state).reason).toContain("review step");
  });

  it("refuses apply when the engine blocked the plan", () => {
    const state = {
      ...confirmedReview(),
      preview: preview({ blocked: true }),
      confirmed: true,
    };
    expect(canApply(state).ok).toBe(false);
    expect(canApply(state).reason).toContain("will not apply it");
  });

  it("refuses apply while another native call is running", () => {
    const state = { ...confirmedReview(), busy: "preview" as const };
    expect(canApply(state).ok).toBe(false);
  });
});

describe("explicit confirmation", () => {
  it("refuses apply without confirmation", () => {
    const state = reduce(confirmedReview(), {
      type: "confirmation.set",
      confirmed: false,
    });
    expect(canApply(state).reason).toContain("Confirm that you want");
  });

  it("cannot be confirmed before a matching preview exists", () => {
    const state = run(
      initialState,
      { type: "detection.loaded", report: detection() },
      { type: "catalog.loaded", catalog: catalog() },
      { type: "confirmation.set", confirmed: true },
    );
    expect(state.confirmed).toBe(false);
  });

  it("cannot be confirmed against a preview for another profile", () => {
    const base = confirmedReview();
    const state = reduce(
      {
        ...base,
        confirmed: false,
        selection: { kind: "bundled", profileId: "maximum-performance" },
      },
      { type: "confirmation.set", confirmed: true },
    );
    expect(state.confirmed).toBe(false);
  });

  it("is re-asked whenever a fresh preview arrives", () => {
    const state = reduce(confirmedReview(), {
      type: "preview.loaded",
      report: preview(),
    });
    expect(state.confirmed).toBe(false);
  });

  it("is dropped when apply fails, so a retry is confirmed again", () => {
    const state = reduce(confirmedReview(), {
      type: "apply.failed",
      error: {
        title: "Could not apply the profile",
        detail: "Permission denied.",
        nextStep: "Try again.",
      },
    });
    expect(state.confirmed).toBe(false);
    expect(canApply(state).ok).toBe(false);
  });

  it("is dropped after a successful apply", () => {
    const state = reduce(confirmedReview(), {
      type: "apply.succeeded",
      outcome: outcome(),
    });
    expect(state.confirmed).toBe(false);
  });

  it("does not mark the machine busy for an apply it would refuse", () => {
    const unconfirmed = reduce(confirmedReview(), {
      type: "confirmation.set",
      confirmed: false,
    });
    expect(reduce(unconfirmed, { type: "apply.loading" }).busy).toBeNull();
  });

  it("marks the machine busy for an apply it would allow", () => {
    expect(reduce(confirmedReview(), { type: "apply.loading" }).busy).toBe(
      "apply",
    );
  });
});
