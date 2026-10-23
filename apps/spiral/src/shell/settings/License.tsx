import { useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import { Segmented } from "../../ui/Segmented";
import { EmailUnlock } from "../license/EmailUnlock";
import { licenseView } from "../license/api";
import { activationError } from "../license/copy";
import type { LicenseView } from "../license/types";

interface LicenseProps {
  view: LicenseView;
  onView: (view: LicenseView) => void;
}

type Mode = "email" | "key";

export function License({ view, onView }: LicenseProps) {
  const [mode, setMode] = useState<Mode>("email");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const line =
    view.kind === "licensed" && view.grace
      ? "Spiral could not reach its license server. This Mac stays licensed for now."
      : view.kind === "licensed"
        ? "This Mac is licensed."
        : view.kind === "locked" || view.kind === "retry"
          ? view.message
          : "Checking the license.";

  async function refresh() {
    try {
      onView(await licenseView());
    } catch {
      setError("Spiral could not check the license. Try again.");
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

  return (
    <div className="set">
      <p className="notice">{line}</p>
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
              void refresh();
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
    </div>
  );
}
