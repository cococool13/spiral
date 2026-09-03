import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WHOP_CHECKOUT_URL } from "../lib/whop";

interface ActivateProps {
  onDone: () => void;
}

/** License gate before Setup or the main flow. Matches Wallpaper’s activate
 *  contract; visual language follows Setup (stage / field / btn). */
export function Activate({ onDone }: ActivateProps) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
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
    <section className="stage activate-screen">
      <h2 className="panel__title">Spiral Resume</h2>
      <p className="panel__lede">
        Enter your Whop license key. The app stays locked until the key checks out.
      </p>
      <form className="activate" onSubmit={submit}>
        <label className="field" htmlFor="license-key">
          <span className="field__label">License key</span>
          <input
            id="license-key"
            className="field__input"
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
        </label>
        {error ? <p className="activate__error" role="alert">{error}</p> : null}
        <div className="panel__actions">
          <button
            className="btn btn--primary"
            type="submit"
            disabled={busy || !key.trim()}
          >
            {busy ? "Checking…" : "Activate"}
          </button>
        </div>
      </form>
      <p className="activate-screen__buy">
        <a href={WHOP_CHECKOUT_URL} target="_blank" rel="noreferrer">
          Buy Spiral Collection — $9.99
        </a>
      </p>
    </section>
  );
}
