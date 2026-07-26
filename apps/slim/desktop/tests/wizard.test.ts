import { describe, expect, it } from "vitest";

import {
  RECOMMENDED_PROFILE_ID,
  canAdvance,
  initialState,
  reduce,
  stepIndex,
} from "../src/lib/wizard";
import type { WizardState } from "../src/lib/wizard";
import { catalog, detection, outcome, preview, run } from "./fixtures";

/** The bundled profile id currently selected, or null. */
function selectedProfileId(state: WizardState): string | null {
  return state.selection?.kind === "bundled" ? state.selection.profileId : null;
}

/** State at the start of the review step with a matching preview in hand. */
function reviewReady() {
  return run(
    initialState,
    { type: "detection.loaded", report: detection() },
    { type: "catalog.loaded", catalog: catalog() },
    { type: "channel.toggled", channelId: "beta" }, // leave stable only
    { type: "step.next" },
    { type: "step.next" },
    { type: "preview.loaded", report: preview() },
  );
}

describe("the wizard walks forward one step at a time", () => {
  it("starts on the welcome step with nothing selected", () => {
    expect(initialState.step).toBe("welcome");
    expect(initialState.selectedChannelIds).toEqual([]);
    expect(initialState.selection).toBeNull();
  });

  it("selects every installed channel once detection lands", () => {
    const state = reduce(initialState, {
      type: "detection.loaded",
      report: detection(),
    });
    expect(state.selectedChannelIds).toEqual(["stable", "beta"]);
  });

  it("leaves out a channel that is not actually installed", () => {
    const report = detection();
    const stable = report.channels[0]!;
    const state = reduce(initialState, {
      type: "detection.loaded",
      report: { ...report, channels: [{ ...stable, appPath: "" }] },
    });
    expect(state.selectedChannelIds).toEqual([]);
  });

  it("defaults to the balanced daily profile", () => {
    const state = reduce(initialState, {
      type: "catalog.loaded",
      catalog: catalog(),
    });
    expect(selectedProfileId(state)).toBe(RECOMMENDED_PROFILE_ID);
  });

  it("falls back to the first profile when the recommended one is absent", () => {
    const only = catalog().profiles[1]!;
    const state = reduce(initialState, {
      type: "catalog.loaded",
      catalog: { ...catalog(), profiles: [only] },
    });
    expect(selectedProfileId(state)).toBe("maximum-performance");
  });

  it("keeps a profile the person already chose", () => {
    const state = run(
      initialState,
      { type: "catalog.loaded", catalog: catalog() },
      { type: "profile.selected", profileId: "maximum-performance" },
      { type: "catalog.loaded", catalog: catalog() },
    );
    expect(selectedProfileId(state)).toBe("maximum-performance");
  });

  it("refuses to advance from welcome without a channel", () => {
    const state = run(
      initialState,
      { type: "detection.loaded", report: detection() },
      { type: "channel.toggled", channelId: "stable" },
      { type: "channel.toggled", channelId: "beta" },
    );
    expect(canAdvance(state).ok).toBe(false);
    expect(canAdvance(state).reason).toContain("at least one Brave channel");
    expect(reduce(state, { type: "step.next" }).step).toBe("welcome");
  });

  it("refuses to advance from the profile step without a profile", () => {
    const state = run(
      initialState,
      { type: "detection.loaded", report: detection() },
      { type: "step.next" },
    );
    expect(state.step).toBe("profile");
    expect(canAdvance(state).ok).toBe(false);
    expect(reduce(state, { type: "step.next" }).step).toBe("profile");
  });

  it("goes back one step and drops any confirmation on the way", () => {
    const state = run(reviewReady(), { type: "confirmation.set", confirmed: true });
    expect(state.confirmed).toBe(true);
    const back = reduce(state, { type: "step.back" });
    expect(back.step).toBe("profile");
    expect(back.confirmed).toBe(false);
  });

  it("will not navigate while native is working", () => {
    const state = { ...reviewReady(), busy: "apply" as const };
    expect(reduce(state, { type: "step.back" }).step).toBe("review");
  });

  it("never reaches the last step by navigating", () => {
    // "done" is only true once the system actually changed.
    const state = run(reviewReady(), { type: "confirmation.set", confirmed: true });
    expect(canAdvance(state).ok).toBe(true);
    expect(reduce(state, { type: "step.next" }).step).toBe("review");
    expect(stepIndex("done")).toBe(3);
  });

  it("reaches the last step only when apply succeeds", () => {
    const state = reduce(reviewReady(), {
      type: "apply.succeeded",
      outcome: outcome(),
    });
    expect(state.step).toBe("done");
    expect(state.outcome?.profileApprovalPending).toBe(true);
  });
});
