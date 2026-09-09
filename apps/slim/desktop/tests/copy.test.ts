/**
 * copy.ts describes what the bundled JSON already does. The risk it carries
 * is silent omission: an unlabelled module or control must fall back to its
 * stable id and stay visible in the review, never disappear.
 */
import { describe, expect, it } from "vitest";

import {
  CONTROL_LABELS,
  PROFILE_COPY,
  controlLabel,
  profileCopy,
  riskLabel,
} from "../src/lib/copy";
import { RECOMMENDED_PROFILE_ID } from "../src/lib/wizard";

describe("labels fall back rather than hide", () => {
  it("falls back to the stable id for an unknown control", () => {
    expect(controlLabel("vendor.something-new")).toBe("vendor.something-new");
  });

  it("falls back for an unknown risk level", () => {
    expect(riskLabel("catastrophic")).toBe("catastrophic");
  });

  it("returns null for a profile with no written copy", () => {
    expect(profileCopy("not-a-profile")).toBeNull();
  });
});

describe("the described profiles match what ships", () => {
  it("describes the recommended profile", () => {
    const copy = profileCopy(RECOMMENDED_PROFILE_ID);
    expect(copy).not.toBeNull();
    expect(copy?.purpose).not.toBe("");
  });

  it("gives every described profile at least one stated tradeoff", () => {
    for (const [id, copy] of Object.entries(PROFILE_COPY)) {
      expect(copy.tradeoffs.length, `${id} has no tradeoffs`).toBeGreaterThan(0);
      expect(copy.purpose.length, `${id} has no purpose`).toBeGreaterThan(0);
    }
  });

  it("keeps every label non-empty", () => {
    for (const label of Object.values(CONTROL_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("uses no em-dash in any user-visible string", () => {
    const strings = [
      ...Object.values(CONTROL_LABELS),
      ...Object.values(PROFILE_COPY).flatMap((copy) => [
        copy.purpose,
        ...copy.tradeoffs,
      ]),
    ];
    for (const value of strings) {
      expect(value, `em-dash in ${JSON.stringify(value)}`).not.toMatch(/[—–]/);
    }
  });
});
