import { useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RESEND_URL } from "../../lib/checkout";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import { Segmented } from "../../ui/Segmented";
import { EmailUnlock } from "../license/EmailUnlock";
import { licenseView } from "../license/api";
import { activationError } from "../license/copy";
import { openExternal } from "../license/open";
import type { LicenseView } from "../license/types";

interface LicenseProps {
  view: LicenseView;
  onView: (view: LicenseView) => void;
}

type Mode = "email" | "key";

function statusLine(view: LicenseView): string {
  if (view.kind === "licensed" && view.grace) {
    return "Spiral could not reach its license server. This Mac stays licensed for now.";
  }
  if (view.kind === "licensed") return "This Mac is licensed.";
  if (view.kind === "needsActivation") return "This Mac is not licensed.";
  if (view.kind === "locked" || view.kind === "retry") return view.message;
  return "Checking the license.";
}

export function License({ view, onView }: LicenseProps) {
  const [mode, setMode] = useState<Mode>("email");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const line = statusLine(view);
  const showForm = view.kind === "needsActivation" || view.kind === "locked" || view.kind === "retry";

  async function refresh() {
    onView(await licenseView());
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await invoke("license_clear");
    } catch {
      setError("Spiral could not remove the license. Try again.");
      setBusy(false);
      return;
    }
    try {
      await refresh();
    } catch {
      setError("Spiral could not check the license. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitKey(event: FormEvent) {
    event.preventDefault();
    if (!key.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await invoke("license_activate", { key: key.trim() });
      setKey("");
      await refresh();
    } catch (caught) {
      setError(activationError(typeof caught === "string" ? caught : "Could not activate that key."));
    } finally {
      setBusy(false);
    }
  }

  if (view.kind === "licensed") {
    return (
      <div className="set">
        <p className="notice">{line}</p>
        <div className="set-row">
          <div className="set-row__copy">
            <p className="tile__line tile__line--hot">{view.key || "Key on file"}</p>
            {view.device ? <p className="tile__line">{view.device}</p> : null}
          </div>
          <div className="set-row__actions">
            <Button type="button" disabled={busy} onClick={() => void remove()}>
              {busy ? "Removing" : "Remove"}
            </Button>
          </div>
        </div>
        <p className="set-help">
          <button type="button" className="link" onClick={() => openExternal(RESEND_URL, setOpenError)}>
            Lost your key?
          </button>
        </p>
        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : null}
        {openError ? (
          <p className="notice notice--error" role="alert">
            {openError}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="set">
      <p className="notice">{line}</p>
      {showForm ? (
        <div className="set-license">
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
            <EmailUnlock
              onDone={() => {
                void refresh().catch(() => setError("Spiral could not check the license. Try again."));
              }}
            />
          ) : (
            <form className="stage__form" onSubmit={(event) => void submitKey(event)}>
              <Field
                id="settings-license-key"
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
              <Button variant="primary" type="submit" disabled={busy || !key.trim()}>
                {busy ? "Checking" : "Activate"}
              </Button>
            </form>
          )}
          {error ? (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
