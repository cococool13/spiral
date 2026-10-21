import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CHECKOUT_URL, RESEND_URL } from "../lib/checkout";
import { useRadioGroup } from "../lib/useRadioGroup";
import { EmailUnlock } from "./EmailUnlock";

interface ActivateProps {
  onDone: () => void;
}

type Mode = "key" | "email";

const MODES: { id: Mode; name: string }[] = [
  { id: "key", name: "License key" },
  { id: "email", name: "Email" },
];

/** License gate before Setup or the main flow. Matches Wallpaper’s activate
 *  contract; visual language follows Setup (stage / field / btn). */
export function Activate({ onDone }: ActivateProps) {
  const [mode, setMode] = useState<Mode>("key");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [error, setError] = useState("");
  // The arrow keys move focus within the switch, so once it has been used no
  // form may pull focus out of it with autoFocus.
  const switched = useRef(false);
  const modeProps = useRadioGroup(
    MODES.map((m) => m.id),
    mode,
    (m: Mode) => {
      switched.current = true;
      setMode(m);
    },
  );

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
      <div className="unlock-mode" role="radiogroup" aria-label="Unlock with">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className="btn unlock-mode__option"
            disabled={busy || emailBusy}
            {...modeProps(m.id)}
          >
            {m.name}
          </button>
        ))}
      </div>
      <EmailUnlock
        onDone={onDone}
        hidden={mode !== "email"}
        onBusyChange={setEmailBusy}
        autoFocus={!switched.current}
      />
      {mode === "key" && (
        <>
          <p className="panel__lede">
            Enter your Spiral Collection license key. The app stays locked until the key checks out.
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
                placeholder="Paste key from your purchase email"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                disabled={busy}
                autoFocus={!switched.current}
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
        </>
      )}
      <p className="activate-screen__buy">
        <a href={RESEND_URL} target="_blank" rel="noreferrer">
          Lost your key? Email it to me again
        </a>
        {" · "}
        <a href={CHECKOUT_URL} target="_blank" rel="noreferrer">
          Buy Spiral Collection — $15
        </a>
      </p>
    </section>
  );
}
