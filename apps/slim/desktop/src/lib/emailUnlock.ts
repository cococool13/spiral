/**
 * Unlock with email: the server emails a 6-digit code, the app trades it for
 * the license key. Pure state plus two steps that take `invoke` as an
 * argument, so the flow is tested without a webview.
 */

export interface EmailUnlockState {
  email: string;
  /** Set once a code is on its way; the code step shows while it is set. */
  sentTo: string | null;
  resent: boolean;
  code: string;
  busy: "send" | "check" | null;
  error: string;
}

export type EmailUnlockEvent =
  | { type: "email"; value: string }
  | { type: "code"; value: string }
  | { type: "busy"; busy: "send" | "check" }
  | { type: "sent"; to: string; again: boolean }
  | { type: "failed"; error: string }
  | { type: "unlocked" }
  | { type: "change-email" };

export const initialEmailUnlock: EmailUnlockState = {
  email: "",
  sentTo: null,
  resent: false,
  code: "",
  busy: null,
  error: "",
};

export function reduceEmailUnlock(
  state: EmailUnlockState,
  event: EmailUnlockEvent,
): EmailUnlockState {
  switch (event.type) {
    case "email":
      return { ...state, email: event.value };
    case "code":
      // Pasted codes may carry spaces or dashes: keep the digits.
      return { ...state, code: event.value.replace(/\D/g, "").slice(0, 6) };
    case "busy":
      return { ...state, busy: event.busy, error: "" };
    case "sent":
      return { ...state, busy: null, sentTo: event.to, resent: event.again };
    case "failed":
      return { ...state, busy: null, error: event.error };
    case "unlocked":
      return { ...state, busy: null };
    case "change-email":
      return { ...state, sentTo: null, resent: false, code: "", error: "" };
  }
}

export const canSend = (s: EmailUnlockState) => s.busy === null && s.email.trim() !== "";
export const canUnlock = (s: EmailUnlockState) => s.busy === null && s.code.length === 6;

export type Invoke = (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
type Dispatch = (event: EmailUnlockEvent) => void;

function message(e: unknown, fallback: string) {
  return typeof e === "string" ? e : fallback;
}

export async function sendCode(call: Invoke, dispatch: Dispatch, email: string, again: boolean) {
  dispatch({ type: "busy", busy: "send" });
  try {
    await call("license_request_code", { email });
    dispatch({ type: "sent", to: email, again });
  } catch (e) {
    dispatch({ type: "failed", error: message(e, "Could not send a code.") });
  }
}

export async function unlockWithCode(
  call: Invoke,
  dispatch: Dispatch,
  email: string,
  code: string,
  onDone: () => void,
) {
  dispatch({ type: "busy", busy: "check" });
  try {
    await call("license_activate_email", { email, code });
    dispatch({ type: "unlocked" });
    onDone();
  } catch (e) {
    dispatch({ type: "failed", error: message(e, "Could not check that code.") });
  }
}
