import { useEffect, useState } from "react";
import { engineInfo, useRulesOnly } from "../api";

/** Model setup is optional and comes after the first typeset page, never
 *  before it. Shown once, until the person answers. */
export function SetupCard({ ready, onSetUp }: { ready: boolean; onSetUp: () => void }) {
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    let live = true;
    engineInfo()
      .then((info) => {
        if (live) setAsk(info.needsSetup);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [ready]);

  if (!ask) return null;
  return (
    <aside className="setup-card" aria-label="Optional model">
      <p>
        <strong>Optional: a model for tightening.</strong> It can shorten lines and never changes a fact. Nothing
        downloads and no key is sent until you choose one.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <div className="setup-card__actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            useRulesOnly()
              .then(() => setAsk(false))
              .catch((err: unknown) => setError(`That did not save: ${String(err)}. Try again.`));
          }}
        >
          Not now
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            setAsk(false);
            onSetUp();
          }}
        >
          Set up
        </button>
      </div>
    </aside>
  );
}
