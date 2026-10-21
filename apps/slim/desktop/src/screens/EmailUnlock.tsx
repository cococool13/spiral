import { useEffect, useReducer } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  canSend,
  canUnlock,
  initialEmailUnlock,
  reduceEmailUnlock,
  sendCode,
  unlockWithCode,
} from "../lib/emailUnlock";

interface EmailUnlockProps {
  onDone: () => void;
  /** Hidden while the key form shows. The component stays mounted so a sent code survives a switch. */
  hidden?: boolean;
  /** Lets the screen lock the mode switch while a code is being sent or checked. */
  onBusyChange?: (busy: boolean) => void;
}

/** Unlock without the key: the server emails a 6-digit code to the buyer. */
export function EmailUnlock({ onDone, hidden = false, onBusyChange }: EmailUnlockProps) {
  const [state, dispatch] = useReducer(reduceEmailUnlock, initialEmailUnlock);
  const { email, sentTo, resent, code, busy, error } = state;

  const isBusy = busy !== null;
  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  if (hidden) return null;

  const errorRegion = (
    <p className="activate__error" aria-live="polite">
      {error}
    </p>
  );

  if (!sentTo) {
    return (
      <>
        <p className="activate-screen__line">
          Enter the email you paid with. We'll send you a 6-digit code.
        </p>
        <form
          className="activate"
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode(invoke, dispatch, email.trim(), false);
          }}
        >
          <label className="activate__label" htmlFor="license-email">
            Email
          </label>
          <input
            id="license-email"
            className="activate__input"
            type="email"
            name="email"
            autoComplete="email"
            spellCheck={false}
            value={email}
            onChange={(e) => dispatch({ type: "email", value: e.target.value })}
            disabled={busy !== null}
            autoFocus
          />
          {errorRegion}
          <button type="submit" data-variant="primary" disabled={!canSend(state)}>
            {busy === "send" ? "Sending…" : "Send code"}
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <p className="activate-screen__line">
        {resent ? "Enter the new code sent to " : "Enter the code sent to "}
        {sentTo}.
      </p>
      <form
        className="activate"
        onSubmit={(e) => {
          e.preventDefault();
          void unlockWithCode(invoke, dispatch, sentTo, code, onDone);
        }}
      >
        <label className="activate__label" htmlFor="license-code">
          6-digit code
        </label>
        <input
          id="license-code"
          className="activate__input"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => dispatch({ type: "code", value: e.target.value })}
          disabled={busy !== null}
          autoFocus
        />
        {errorRegion}
        <button type="submit" data-variant="primary" disabled={!canUnlock(state)}>
          {busy === "check" ? "Checking…" : "Unlock"}
        </button>
        <div className="activate__links">
          <button
            type="button"
            className="activate__link"
            onClick={() => void sendCode(invoke, dispatch, sentTo, true)}
            disabled={busy !== null}
          >
            {busy === "send" ? "Sending…" : "Send again"}
          </button>
          <button
            type="button"
            className="activate__link"
            onClick={() => dispatch({ type: "change-email" })}
            disabled={busy !== null}
          >
            Use a different email
          </button>
        </div>
      </form>
    </>
  );
}
