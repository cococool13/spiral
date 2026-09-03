import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import lockupRed from "../assets/brand/lockup-red.svg";
import { WHOP_CHECKOUT_URL } from "../lib/whop";

interface ActivateProps {
  onDone: () => void;
}

export function Activate({ onDone }: ActivateProps) {
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
    <main className="firstrun">
      <img src={lockupRed} alt="Spiral" className="firstrun__lockup" />
      <p className="firstrun__line">
        Enter your Whop license key. The app stays locked until the key checks out.
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
          placeholder="Paste key from Whop"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={busy}
          autoFocus
        />
        {error && <p className="activate__error">{error}</p>}
        <button
          className="btn-glass btn-glass--primary"
          type="submit"
          disabled={busy || !key.trim()}
        >
          {busy ? "Checking…" : "Activate"}
        </button>
      </form>
      <p className="firstrun__line">
        <a href={WHOP_CHECKOUT_URL} target="_blank" rel="noreferrer">
          Buy Spiral Collection — $9.99
        </a>
      </p>
    </main>
  );
}
