import { useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import mark from "../../assets/brand/mark-red.svg";
import { CHECKOUT_URL, RESEND_URL } from "../../lib/checkout";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import { Segmented } from "../../ui/Segmented";
import { activationError } from "./copy";
import { EmailUnlock } from "./EmailUnlock";
import { openExternal } from "./open";

interface ActivateProps {
  onDone: () => void;
}

type Mode = "email" | "key";

export function Activate({ onDone }: ActivateProps) {
  const [mode, setMode] = useState<Mode>("email");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  async function submitKey(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await invoke("license_activate", { key: key.trim() });
      onDone();
    } catch (caught) {
      setError(activationError(typeof caught === "string" ? caught : "Could not activate that key."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="stage">
      <img className="stage__mark" src={mark} alt="Spiral" width={352} height={566} />
      <h1>Activate Spiral</h1>
      <Segmented
        label="Unlock with"
        value={mode}
        options={[
          { value: "email", label: "Email" },
          { value: "key", label: "License key" },
        ]}
        disabled={busy}
        onChange={setMode}
      />
      {mode === "email" ? (
        <EmailUnlock onDone={onDone} />
      ) : (
        <form className="stage__form" onSubmit={(event) => void submitKey(event)}>
          <Field
            id="license-key"
            label="License key"
            name="license-key"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Paste the key from your purchase email"
            value={key}
            disabled={busy}
            onChange={(event) => setKey(event.target.value)}
          />
          {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
          <Button variant="primary" size="large" type="submit" disabled={busy || !key.trim()}>
            {busy ? "Checking…" : "Activate"}
          </Button>
        </form>
      )}
      {openError ? <p className="notice notice--error" role="alert">{openError}</p> : null}
      <footer className="stage__links">
        <button type="button" className="link" onClick={() => openExternal(CHECKOUT_URL, setOpenError)}>
          Buy Spiral, $15
        </button>
        <button type="button" className="link" onClick={() => openExternal(RESEND_URL, setOpenError)}>
          Lost your key?
        </button>
      </footer>
    </main>
  );
}
