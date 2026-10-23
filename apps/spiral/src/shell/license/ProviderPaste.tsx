import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import { providerClear, providerSet, providerView } from "./api";
import { providerError } from "./copy";
import type { ProviderId, ProviderView } from "./types";

interface ProviderPasteProps {
  provider: ProviderId;
  label: string;
}

export function ProviderPaste({ provider, label }: ProviderPasteProps) {
  const [view, setView] = useState<ProviderView | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = `provider-${provider}`;

  useEffect(() => {
    let live = true;
    void providerView(provider)
      .then((next) => {
        if (live) setView(next);
      })
      .catch(() => {
        if (live) setError("Spiral could not read that provider.");
      });
    return () => {
      live = false;
    };
  }, [provider]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const secret = key.trim();
    if (!secret || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await providerSet(provider, secret);
      setKey("");
      setView(next);
    } catch (caught) {
      const raw = typeof caught === "string" ? caught : "Spiral could not save that key. Paste it again.";
      setError(providerError(raw, secret));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setKey("");
      setView(await providerClear(provider));
    } catch (caught) {
      setError(typeof caught === "string" ? caught : "Spiral could not remove that key.");
    } finally {
      setBusy(false);
    }
  }

  if (!view) {
    return (
      <section className="set-row" aria-busy={error ? undefined : true}>
        <div className="set-row__copy">
          <h2>{label}</h2>
          {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <form className="set-row" onSubmit={(event) => void save(event)}>
      <div className="set-row__copy">
        <h2>{label}</h2>
        {view?.kind === "needsPaste" ? (
          <p className="notice notice--error">Spiral could not read the saved key. Paste it again.</p>
        ) : null}
        {view?.kind === "present" ? <p className="notice">Saved.</p> : null}
        {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
        {view?.kind !== "present" ? (
          <Field
            id={fieldId}
            label="API key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste the key"
            value={key}
            disabled={busy}
            onChange={(event) => setKey(event.target.value)}
          />
        ) : null}
      </div>
      {view?.kind === "present" ? (
        <Button disabled={busy} onClick={() => void clear()}>
          Remove
        </Button>
      ) : (
        <Button variant="primary" type="submit" disabled={busy || key.trim().length === 0}>
          Save
        </Button>
      )}
    </form>
  );
}
