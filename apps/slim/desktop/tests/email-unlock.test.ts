import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  canSend,
  canUnlock,
  type EmailUnlockEvent,
  type EmailUnlockState,
  initialEmailUnlock,
  type Invoke,
  reduceEmailUnlock,
  sendCode,
  unlockWithCode,
} from "../src/lib/emailUnlock";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../src/assets/brand/lockup-red.svg", () => ({ default: "lockup.svg" }));

/** Runs dispatched events through the reducer, like useReducer would. */
function store(start: EmailUnlockState = initialEmailUnlock) {
  let state = start;
  const dispatch = (event: EmailUnlockEvent) => {
    state = reduceEmailUnlock(state, event);
  };
  return { dispatch, get: () => state };
}

const ok: Invoke = async () => undefined;

describe("Unlock with", () => {
  it("defaults to the license key, with email as the other option", async () => {
    const { Activate } = await import("../src/screens/Activate");
    const html = renderToStaticMarkup(createElement(Activate, { onDone: () => {} }));
    expect(html).toContain('role="group" aria-label="Unlock with"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>License key</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Email</);
    expect(html).toContain('for="license-key"');
  });
});

describe("email unlock", () => {
  it("sends a code and moves to the code step", async () => {
    const s = store();
    s.dispatch({ type: "email", value: " buyer@example.com " });
    expect(canSend(s.get())).toBe(true);
    const call = vi.fn(ok);

    const pending = sendCode(call, s.dispatch, s.get().email.trim(), false);
    expect(s.get().busy).toBe("send");
    await pending;

    expect(call).toHaveBeenCalledWith("license_request_code", { email: "buyer@example.com" });
    expect(s.get()).toMatchObject({ sentTo: "buyer@example.com", resent: false, busy: null });
  });

  it("keeps only six digits of a pasted code", () => {
    const s = store();
    s.dispatch({ type: "code", value: "12 34-56 7" });
    expect(s.get().code).toBe("123456");
    expect(canUnlock(s.get())).toBe(true);
    s.dispatch({ type: "code", value: "12345" });
    expect(canUnlock(s.get())).toBe(false);
  });

  it("unlocks with the code and calls onDone", async () => {
    const s = store({ ...initialEmailUnlock, sentTo: "buyer@example.com", code: "123456" });
    const call = vi.fn(ok);
    const onDone = vi.fn();

    await unlockWithCode(call, s.dispatch, "buyer@example.com", "123456", onDone);

    expect(call).toHaveBeenCalledWith("license_activate_email", {
      email: "buyer@example.com",
      code: "123456",
    });
    expect(onDone).toHaveBeenCalledOnce();
    expect(s.get().busy).toBeNull();
  });

  it("shows the server's message and stays on the code step", async () => {
    const s = store({ ...initialEmailUnlock, sentTo: "buyer@example.com", code: "000000" });
    const onDone = vi.fn();
    const fail: Invoke = () => Promise.reject("That code is wrong or has expired.");

    await unlockWithCode(fail, s.dispatch, "buyer@example.com", "000000", onDone);

    expect(onDone).not.toHaveBeenCalled();
    expect(s.get()).toMatchObject({
      sentTo: "buyer@example.com",
      busy: null,
      error: "That code is wrong or has expired.",
    });
  });

  it("stays on the email step when sending fails", async () => {
    const s = store();
    const fail: Invoke = () => Promise.reject("Too many tries. Wait a few minutes and try again.");
    await sendCode(fail, s.dispatch, "buyer@example.com", false);
    expect(s.get()).toMatchObject({
      sentTo: null,
      error: "Too many tries. Wait a few minutes and try again.",
    });
  });

  it("falls back to plain words for a non-string error", async () => {
    const s = store();
    await sendCode(() => Promise.reject(new Error("boom")), s.dispatch, "a@b.co", false);
    expect(s.get().error).toBe("Could not send a code.");
  });

  it("sends again and clears the last error", async () => {
    const s = store({ ...initialEmailUnlock, sentTo: "buyer@example.com", error: "old" });
    await sendCode(ok, s.dispatch, "buyer@example.com", true);
    expect(s.get()).toMatchObject({ sentTo: "buyer@example.com", resent: true, error: "" });
  });

  it("clears the old code when a new one is sent", async () => {
    const s = store({ ...initialEmailUnlock, sentTo: "buyer@example.com", code: "123456" });
    await sendCode(ok, s.dispatch, "buyer@example.com", true);
    expect(s.get()).toMatchObject({ resent: true, code: "" });
  });

  it("goes back to the email step for a different email", () => {
    const s = store({
      ...initialEmailUnlock,
      email: "buyer@example.com",
      sentTo: "buyer@example.com",
      resent: true,
      code: "123456",
      error: "That code is wrong or has expired.",
    });
    s.dispatch({ type: "change-email" });
    expect(s.get()).toMatchObject({ sentTo: null, resent: false, code: "", error: "" });
    expect(s.get().email).toBe("buyer@example.com");
  });
});
