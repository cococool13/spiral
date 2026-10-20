import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import lockupRed from "../assets/brand/lockup-red.svg";
import { CHECKOUT_URL, RESEND_URL } from "../lib/checkout";
import { EmailUnlock } from "./EmailUnlock";

interface ActivateProps {
  onDone: () => void;
}

type Mode = "key" | "email";

const MODES: { value: Mode; label: string }[] = [
  { value: "key", label: "License key" },
  { value: "email", label: "Email" },
];

export function Activate({ onDone }: ActivateProps) {
  const [mode, setMode] = useState<Mode>("key");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await invoke("license_activate", { key: key.trim() });
      onDone();
    } catch (e) {
      setError(typeof e === "string" ? e : "Could not activate that key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="activate-screen">
      <img src={lockupRed} alt="Spiral Clean" className="activate-screen__lockup" />
      <div className="unlock-mode" role="group" aria-label="Unlock with">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            className="unlock-mode__option"
            aria-pressed={mode === m.value}
            onClick={() => setMode(m.value)}
            disabled={busy}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === "email" ? (
        <EmailUnlock onDone={onDone} />
      ) : (
        <>
          <p className="activate-screen__line">
            Enter your Spiral Collection license key. The app stays locked until the key checks out.
          </p>
          <form className="activate" onSubmit={submit}>
            <label className="activate__label" htmlFor="license-key">
              License key
            </label>
            <input
              id="license-key"
              className="activate__input"
              name="license-key"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Paste key from your purchase email"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={busy}
              autoFocus
            />
            {error && <p className="activate__error">{error}</p>}
            <button type="submit" disabled={busy || !key.trim()}>
              {busy ? "Checking…" : "Activate"}
            </button>
          </form>
        </>
      )}
      <p className="activate-screen__line">
        <a href={RESEND_URL} target="_blank" rel="noreferrer">
          Lost your key? Email it to me again
        </a>
        {" · "}
        <a href={CHECKOUT_URL} target="_blank" rel="noreferrer">
          Buy Spiral Collection — $15
        </a>
      </p>
    </main>
  );
}
