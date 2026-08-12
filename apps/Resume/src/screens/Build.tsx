import { useEffect, useState } from "react";
import { buildDocument } from "../lib/ipc";
import type { BuildResult, Draft, Progress } from "../lib/types";

/** Every percent shown here was reported by Rust after the work that earned it.
 *  On the deterministic path the whole thing crosses in well under a second —
 *  that is the honest result, not something to pad out. */
export function Build({
  draft,
  onDone,
  onBack,
}: {
  draft: Draft;
  onDone: (result: BuildResult) => void;
  onBack: () => void;
}) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    buildDocument(draft, (next) => {
      if (current) setProgress(next);
    })
      .then((result) => {
        if (current) onDone(result);
      })
      .catch((e) => {
        if (current) setError(`${e}`);
      });
    return () => {
      current = false;
    };
    // Building is a one-shot action for this screen; re-running it because a
    // callback identity changed would build the same file twice. A fresh `key`
    // from App is what starts a second build.
    // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot by design
  }, []);

  if (error) {
    return (
      <section className="panel">
        <h2 className="panel__title">That did not build</h2>
        <p className="notice notice--warn">{error}</p>
        <div className="panel__actions">
          <button type="button" className="btn" onClick={onBack}>
            Back to Style
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="panel__title">Building your resume</h2>
      <p className="build__stage" aria-live="polite">
        {progress ? `${progress.stage}…` : "Starting…"}
      </p>
      {/* Named while it works, not only afterwards on the result. */}
      {progress?.engine ? <p className="panel__lede">{progress.engine}</p> : null}
      <progress
        className="build__bar"
        max={100}
        value={progress?.percent ?? 0}
        aria-label="Build progress"
      />
      <p className="build__percent">{progress?.percent ?? 0}%</p>
    </section>
  );
}
