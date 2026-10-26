import { useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../ui/Button";
import { CodeField } from "../../ui/CodeField";
import { Field } from "../../ui/Field";
import { Plate } from "../../ui/Plate";
import { activationError } from "./copy";

interface EmailUnlockProps {
  onDone: () => void;
}

export function EmailUnlock({ onDone }: EmailUnlockProps) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [travel, setTravel] = useState(false);

  async function send(target: string) {
    setBusy(true);
    setError(null);
    try {
      await invoke("license_request_code", { email: target });
      setSentTo(target);
      setCode("");
      if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        setTravel(true);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setTravel(false));
        });
      }
    } catch (caught) {
      setError(activationError(typeof caught === "string" ? caught : "Could not send a code."));
    } finally {
      setBusy(false);
    }
  }

  async function activate(event: FormEvent) {
    event.preventDefault();
    if (!sentTo || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await invoke("license_activate_email", { email: sentTo, code });
      onDone();
    } catch (caught) {
      setError(activationError(typeof caught === "string" ? caught : "Could not check that code."));
    } finally {
      setBusy(false);
    }
  }

  if (!sentTo) {
    return (
      <form
        className="stage__form"
        onSubmit={(event) => {
          event.preventDefault();
          void send(email.trim());
        }}
      >
        <Field
          id="license-email"
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          spellCheck={false}
          value={email}
          disabled={busy}
          onChange={(event) => setEmail(event.target.value)}
        />
        {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
        <Button variant="primary" size="large" type="submit" disabled={busy || !email.trim()}>
          {busy ? "Sending…" : "Send code"}
        </Button>
      </form>
    );
  }

  return (
    <form className="stage__form" onSubmit={(event) => void activate(event)}>
      <p className="notice">Enter the code sent to {sentTo}.</p>
      <Plate marked travel={travel} className="plate--code">
        <CodeField value={code} disabled={busy} invalid={Boolean(error)} onChange={setCode} />
      </Plate>
      <p className="tile__line">6-digit code · Checked by Spiral's license server</p>
      {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
      <Button variant="primary" size="large" type="submit" disabled={busy || code.length !== 6}>
        {busy ? "Checking…" : "Activate"}
      </Button>
      <div className="stage__links">
        <button type="button" className="link" disabled={busy} onClick={() => void send(sentTo)}>
          Send again
        </button>
        <button
          type="button"
          className="link"
          disabled={busy}
          onClick={() => {
            setSentTo(null);
            setCode("");
            setError(null);
          }}
        >
          Use a different email
        </button>
      </div>
    </form>
  );
}
