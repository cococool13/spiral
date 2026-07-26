import { describe, expect, it } from "vitest";

import {
  ContractError,
  applyOutcome,
  decode,
  detectionReport,
  previewReport,
  profileCatalog,
} from "../src/lib/contract";
import { toWizardError } from "../src/lib/ipc";
import { canApply, initialState, reduce } from "../src/lib/wizard";
import { catalog, detection, preview, run } from "./fixtures";

const ERROR = {
  title: "Could not check this Mac",
  detail: "python3 could not start.",
  nextStep: "Install the Xcode command line tools, then reopen Spiral Slim.",
};

describe("payloads crossing the native boundary are validated", () => {
  it("accepts a well-formed detection report", () => {
    expect(decode(detectionReport, "detection", detection()).found).toBe(true);
  });

  it("rejects a detection report with an unknown platform", () => {
    const payload = { ...detection(), platform: "haiku" };
    expect(() => decode(detectionReport, "detection", payload)).toThrow(
      ContractError,
    );
  });

  it("rejects a payload carrying an unexpected field", () => {
    const payload = { ...detection(), elevate: true };
    expect(() => decode(detectionReport, "detection", payload)).toThrow(
      ContractError,
    );
  });

  it("names the offending field so the error is actionable", () => {
    const report = preview();
    const target = report.targets[0]!;
    const payload = {
      ...report,
      targets: [{ ...target, changes: { ...target.changes, add: -1 } }],
    };
    try {
      decode(previewReport, "The change review", payload);
      expect.unreachable("expected the decode to fail");
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(ContractError);
      expect((thrown as ContractError).message).toContain("targets.0.changes.add");
    }
  });

  it("rejects a plan hash that is not a sha256 digest", () => {
    expect(() =>
      decode(previewReport, "review", { ...preview(), planHash: "deadbeef" }),
    ).toThrow(ContractError);
  });

  it("rejects an empty profile list", () => {
    expect(() => decode(profileCatalog, "catalog", { profiles: [] })).toThrow(
      ContractError,
    );
  });

  it("rejects an outcome with no message to show", () => {
    const payload = {
      planHash: "a".repeat(64),
      profileId: "balanced-daily",
      message: "",
      channelLabels: [],
      managedPolicyCount: 1,
      persistMode: "on",
      profileApprovalPending: true,
      braveRunning: false,
    };
    expect(() => decode(applyOutcome, "result", payload)).toThrow(ContractError);
  });

  it("rejects a profile id that is a path", () => {
    const payload = { profiles: [{ ...catalog().profiles[0]!, id: "../etc" }] };
    expect(() => decode(profileCatalog, "catalog", payload)).toThrow(
      ContractError,
    );
  });
});

describe("errors always carry a next step", () => {
  it("passes a native error through unchanged", () => {
    expect(toWizardError("fallback", ERROR)).toEqual(ERROR);
  });

  it("turns a contract failure into an actionable error", () => {
    const error = toWizardError(
      "Could not review the changes",
      new ContractError("The change review", "targets: too small"),
    );
    expect(error.title).toBe("Could not review the changes");
    expect(error.nextStep).toContain("Nothing was changed");
  });

  it("turns an unknown throw into an actionable error", () => {
    const error = toWizardError("Could not apply the profile", "boom");
    expect(error.detail).toBe("boom");
    expect(error.nextStep).not.toBe("");
  });

  it("rejects an object that is only partly an error", () => {
    const error = toWizardError("fallback", { title: "x", detail: "y" });
    expect(error.title).toBe("fallback");
  });
});

describe("failures leave the wizard in a state a person can act on", () => {
  it("clears the detection when detection fails", () => {
    const state = run(
      initialState,
      { type: "detection.loaded", report: detection() },
      { type: "detection.failed", error: ERROR },
    );
    expect(state.detection).toBeNull();
    expect(state.busy).toBeNull();
    expect(state.error).toEqual(ERROR);
  });

  it("clears the preview and confirmation when the review fails", () => {
    const state = run(
      initialState,
      { type: "detection.loaded", report: detection() },
      { type: "catalog.loaded", catalog: catalog() },
      { type: "channel.toggled", channelId: "beta" },
      { type: "step.next" },
      { type: "step.next" },
      { type: "preview.loaded", report: preview() },
      { type: "confirmation.set", confirmed: true },
      { type: "preview.failed", error: ERROR },
    );
    expect(state.preview).toBeNull();
    expect(state.confirmed).toBe(false);
    expect(canApply(state).ok).toBe(false);
  });

  it("stays on the review step when apply fails, so nothing looks finished", () => {
    const state = run(
      initialState,
      { type: "detection.loaded", report: detection() },
      { type: "catalog.loaded", catalog: catalog() },
      { type: "channel.toggled", channelId: "beta" },
      { type: "step.next" },
      { type: "step.next" },
      { type: "preview.loaded", report: preview() },
      { type: "confirmation.set", confirmed: true },
      { type: "apply.failed", error: ERROR },
    );
    expect(state.step).toBe("review");
    expect(state.outcome).toBeNull();
    expect(state.error).toEqual(ERROR);
  });

  it("dismissing an error leaves everything else alone", () => {
    const state = run(
      initialState,
      { type: "detection.loaded", report: detection() },
      { type: "catalog.failed", error: ERROR },
      { type: "error.dismissed" },
    );
    expect(state.error).toBeNull();
    expect(state.detection).not.toBeNull();
  });

  it("does not clear the busy flag on an unrelated event", () => {
    const busy = reduce(initialState, { type: "detection.loading" });
    expect(busy.busy).toBe("detection");
    expect(reduce(busy, { type: "error.dismissed" }).busy).toBe("detection");
  });
});
