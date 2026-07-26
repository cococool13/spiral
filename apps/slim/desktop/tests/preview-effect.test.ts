/**
 * The layer that let the review-hang bug through.
 *
 * Every other suite tests the reducer purely, so none of them could see a
 * fault in how App.tsx drives it. This one models React's effect lifecycle
 * (run on dependency change, run cleanup before the next run) against a fake
 * IPC and asserts the observable outcome: the review screen stops loading
 * and ends up with a preview.
 */
import { describe, expect, it, vi } from "vitest";

import type { PreviewReport } from "../src/lib/contract";
import {
  initialState,
  previewRequestKey,
  reduce,
  type WizardEvent,
  type WizardState,
} from "../src/lib/wizard";
import { catalog, customPreview, detection, preview } from "./fixtures";

/**
 * A minimal stand-in for React: hold state, re-run the effect whenever its
 * key changes, and run the previous cleanup first. This mirrors exactly what
 * App.tsx does, including the `cancelled` guard.
 */
function harness(
  fetchPreview: (state: WizardState) => Promise<PreviewReport>,
) {
  let state = initialState;
  let lastKey: string | null = null;
  let cleanup: (() => void) | null = null;
  const inFlight: Promise<void>[] = [];

  function dispatch(event: WizardEvent) {
    state = reduce(state, event);
    syncEffect();
  }

  function syncEffect() {
    const key = previewRequestKey(state);
    if (key === lastKey) return;
    cleanup?.();
    cleanup = null;
    lastKey = key;
    if (key === null) return;

    const forState = state;
    let cancelled = false;
    cleanup = () => {
      cancelled = true;
    };
    inFlight.push(
      (async () => {
        dispatch({ type: "preview.loading" });
        try {
          const report = await fetchPreview(forState);
          if (cancelled) return;
          dispatch({ type: "preview.loaded", report });
        } catch (thrown) {
          if (cancelled) return;
          dispatch({
            type: "preview.failed",
            error: {
              title: "Could not review the changes",
              detail: String(thrown),
              nextStep: "Go back and try again.",
            },
          });
        }
      })(),
    );
  }

  return {
    dispatch,
    settle: async () => {
      // Drain, since a dispatch can start another request.
      for (let i = 0; i < 10 && inFlight.length > 0; i += 1) {
        await Promise.all(inFlight.splice(0));
      }
    },
    get state() {
      return state;
    },
  };
}

function toReview(h: ReturnType<typeof harness>) {
  h.dispatch({ type: "detection.loaded", report: detection() });
  h.dispatch({ type: "catalog.loaded", catalog: catalog() });
  h.dispatch({ type: "channel.toggled", channelId: "beta" }); // stable only
  h.dispatch({ type: "step.next" });
  h.dispatch({ type: "step.next" });
}

describe("the review screen actually finishes loading", () => {
  it("ends with a preview and no busy flag", async () => {
    // The regression: this used to end with busy === "preview" forever.
    const h = harness(async () => preview());
    toReview(h);
    await h.settle();

    expect(h.state.step).toBe("review");
    expect(h.state.busy).toBeNull();
    expect(h.state.preview).not.toBeNull();
    expect(h.state.error).toBeNull();
  });

  it("fetches exactly once for one selection", async () => {
    const fetchPreview = vi.fn(async () => preview());
    const h = harness(fetchPreview);
    toReview(h);
    await h.settle();
    expect(fetchPreview).toHaveBeenCalledTimes(1);
  });

  it("does not loop when the preview matches", async () => {
    const fetchPreview = vi.fn(async () => preview());
    const h = harness(fetchPreview);
    toReview(h);
    await h.settle();
    await h.settle();
    expect(fetchPreview).toHaveBeenCalledTimes(1);
  });

  it("refetches once when the profile changes, and lands", async () => {
    const fetchPreview = vi.fn(async (state: WizardState) =>
      state.selection?.kind === "bundled" &&
      state.selection.profileId === "maximum-performance"
        ? preview({ profileId: "maximum-performance" })
        : preview(),
    );
    const h = harness(fetchPreview);
    toReview(h);
    await h.settle();
    h.dispatch({ type: "profile.selected", profileId: "maximum-performance" });
    await h.settle();

    expect(fetchPreview).toHaveBeenCalledTimes(2);
    expect(h.state.busy).toBeNull();
    expect(h.state.preview?.profileId).toBe("maximum-performance");
  });

  it("lands a custom selection too", async () => {
    const controls = ["security.safe-browsing", "security.downloads.malicious"];
    const h = harness(async () => customPreview(controls));
    toReview(h);
    await h.settle();
    h.dispatch({ type: "custom.selected" });
    h.dispatch({ type: "custom.moduleToggled", moduleId: "privacy-balanced" });
    await h.settle();

    expect(h.state.busy).toBeNull();
    expect(h.state.preview?.profileId).toBe("custom");
  });

  it("surfaces a failure instead of loading forever", async () => {
    const h = harness(async () => {
      throw new Error("python3 exited with status 2");
    });
    toReview(h);
    await h.settle();

    expect(h.state.busy).toBeNull();
    expect(h.state.preview).toBeNull();
    expect(h.state.error?.nextStep).not.toBe("");
  });

  it("does not retry a failure on its own", async () => {
    const fetchPreview = vi.fn(async () => {
      throw new Error("boom");
    });
    const h = harness(fetchPreview);
    toReview(h);
    await h.settle();
    await h.settle();
    expect(fetchPreview).toHaveBeenCalledTimes(1);
  });

  it("retries when the person steps back and forward", async () => {
    let attempt = 0;
    const fetchPreview = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("boom");
      return preview();
    });
    const h = harness(fetchPreview);
    toReview(h);
    await h.settle();
    expect(h.state.error).not.toBeNull();

    h.dispatch({ type: "step.back" });
    h.dispatch({ type: "step.next" });
    await h.settle();

    expect(fetchPreview).toHaveBeenCalledTimes(2);
    expect(h.state.busy).toBeNull();
    expect(h.state.preview).not.toBeNull();
    expect(h.state.error).toBeNull();
  });

  it("discards a slow response for a selection the person moved off", async () => {
    const h = harness(async (state: WizardState) => {
      const isFirst =
        state.selection?.kind === "bundled" &&
        state.selection.profileId === "balanced-daily";
      if (isFirst) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return preview({ profileId: "balanced-daily" });
      }
      return preview({ profileId: "maximum-performance" });
    });
    toReview(h);
    h.dispatch({ type: "profile.selected", profileId: "maximum-performance" });
    await h.settle();

    // The stale in-flight request must not overwrite the current one.
    expect(h.state.preview?.profileId).toBe("maximum-performance");
    expect(h.state.busy).toBeNull();
  });
});
