import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
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

function statusLine(view: LicenseView): string {
  if (view.kind === "licensed" && view.grace) {
    return "Spiral could not reach its license server. This computer stays licensed for now.";
  }
  if (view.kind === "licensed") return "This computer is licensed.";
  if (view.kind === "needsActivation") return "This computer is not licensed.";
  if (view.kind === "locked" || view.kind === "retry") return view.message;
  return "Checking the license.";
}

export function License({ view, onView }: LicenseProps) {
  const [mode, setMode] = useState<Mode>("email");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const line = statusLine(view);
  const showForm = view.kind === "needsActivation" || view.kind === "locked" || view.kind === "retry";

  useEffect(() => {
    if (view.kind !== "licensed") setConfirming(false);
  }, [view.kind]);

  async function refresh() {
    onView(await licenseView());
  }

  function cancelRemove() {
    setConfirming(false);
    requestAnimationFrame(() => {
      document.getElementById("remove-license")?.focus();
    });
  }

  function onConfirmKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || busy) return;
    event.preventDefault();
    cancelRemove();
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    let failed = false;
    try {
      await invoke("license_clear");
    } catch {
      failed = true;
    }
    try {
      const next = await licenseView();
      onView(next);
      if (failed && next.kind === "licensed") {
        setError("Spiral could not remove the license from this computer. Try again.");
      }
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
          {confirming ? null : (
            <div className="set-row__actions">
              <Button id="remove-license" type="button" disabled={busy} onClick={() => setConfirming(true)}>
                Remove from this computer
              </Button>
            </div>
          )}
        </div>
        {confirming ? (
          <div
            className="set-confirm"
            role="alertdialog"
            aria-labelledby="remove-license-title"
            aria-describedby="remove-license-body"
            onKeyDown={onConfirmKey}
          >
            <p className="set-confirm__title" id="remove-license-title">
              Remove the license from this computer?
            </p>
            <p className="set-confirm__body" id="remove-license-body">
              You will need the key or your purchase email to unlock Spiral again. This does not free this computer
              from the 3-computer limit.
            </p>
            <div className="set-confirm__actions">
              <Button type="button" autoFocus disabled={busy} onClick={cancelRemove}>
                Cancel
              </Button>
              <Button variant="primary" type="button" disabled={busy} onClick={() => void remove()}>
                {busy ? "Removing" : "Remove"}
              </Button>
            </div>
            {error ? (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
        {!confirming && error ? (
          <p className="notice notice--error" role="alert">
            {error}
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
                {busy ? "Checking…" : "Activate"}
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
