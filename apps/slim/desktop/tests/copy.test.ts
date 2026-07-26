/**
 * copy.ts describes what the bundled JSON already does. The risk it carries
 * is silent omission: an unlabelled module or control must fall back to its
 * stable id and stay visible in the review, never disappear.
 */
import { describe, expect, it } from "vitest";

import {
  CONTROL_LABELS,
  MODULE_LABELS,
  PROFILE_COPY,
  controlLabel,
  formatPolicyValue,
  moduleLabel,
  profileCopy,
  riskLabel,
} from "../src/lib/copy";
import { RECOMMENDED_PROFILE_ID } from "../src/lib/wizard";

describe("policy values render the way brave://policy shows them", () => {
  it("distinguishes an unset policy from a false one", () => {
    expect(formatPolicyValue(null)).toBe("not set");
    expect(formatPolicyValue(false)).toBe("false");
  });

  it("renders booleans as the literal policy values", () => {
    expect(formatPolicyValue(true)).toBe("true");
  });

  it("renders numbers without reformatting them", () => {
    expect(formatPolicyValue(1)).toBe("1");
    expect(formatPolicyValue(0)).toBe("0");
  });

  it("passes strings through unchanged", () => {
    expect(formatPolicyValue("automatic")).toBe("automatic");
    expect(formatPolicyValue("")).toBe("");
  });
});

describe("labels fall back rather than hide", () => {
  it("falls back to the stable id for an unknown module", () => {
    expect(moduleLabel("not-a-module")).toBe("not-a-module");
  });

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
    for (const label of Object.values({ ...MODULE_LABELS, ...CONTROL_LABELS })) {
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("uses no em-dash in any user-visible string", () => {
    const strings = [
      ...Object.values(MODULE_LABELS),
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
