import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface EmailUnlockProps {
  onDone: () => void;
}

type Busy = "send" | "check" | null;

/** Unlock without the key: the server emails a 6-digit code to the buyer. */
export function EmailUnlock({ onDone }: EmailUnlockProps) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");

  async function run(kind: Exclude<Busy, null>, action: () => Promise<void>, fallback: string) {
    setBusy(kind);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(typeof e === "string" ? e : fallback);
    } finally {
      setBusy(null);
    }
  }

  function send(target: string, again: boolean) {
    return run(
      "send",
      async () => {
        await invoke("license_request_code", { email: target });
        setSentTo(target);
        setResent(again);
      },
      "Could not send a code.",
    );
  }

  function unlock(event: React.FormEvent) {
    event.preventDefault();
    if (!sentTo) return;
    return run(
      "check",
      async () => {
        await invoke("license_activate_email", { email: sentTo, code });
        onDone();
      },
      "Could not check that code.",
    );
  }

  function changeEmail() {
    setSentTo(null);
    setCode("");
    setError("");
  }

  const errorRegion = (
    <p className="activate__error" aria-live="polite">
      {error}
    </p>
  );

  if (!sentTo) {
    return (
      <>
        <p className="panel__lede">Enter the email you paid with. We'll send you a 6-digit code.</p>
        <form
          className="activate"
          onSubmit={(e) => {
            e.preventDefault();
            void send(email.trim(), false);
          }}
        >
          <label className="field" htmlFor="license-email">
            <span className="field__label">Email</span>
            <input
              id="license-email"
              className="field__input"
              type="email"
              name="email"
              autoComplete="email"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy !== null}
              autoFocus
            />
          </label>
          {errorRegion}
          <div className="panel__actions">
            <button
              className="btn btn--primary"
              type="submit"
              disabled={busy !== null || !email.trim()}
            >
              {busy === "send" ? "Sending…" : "Send code"}
            </button>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <p className="panel__lede">
        {resent ? "Enter the new code sent to " : "Enter the code sent to "}
        {sentTo}.
      </p>
      <form className="activate" onSubmit={unlock}>
        <label className="field" htmlFor="license-code">
          <span className="field__label">6-digit code</span>
          <input
            id="license-code"
            className="field__input"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            disabled={busy !== null}
            autoFocus
          />
        </label>
        {errorRegion}
        <div className="panel__actions">
          <button
            className="btn btn--primary"
            type="submit"
            disabled={busy !== null || code.length !== 6}
          >
            {busy === "check" ? "Checking…" : "Unlock"}
          </button>
        </div>
        <div className="activate__links">
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => void send(sentTo, true)}
            disabled={busy !== null}
          >
            {busy === "send" ? "Sending…" : "Send again"}
          </button>
          <button
            type="button"
            className="btn btn--quiet"
            onClick={changeEmail}
            disabled={busy !== null}
          >
            Use a different email
          </button>
        </div>
      </form>
    </>
  );
}
