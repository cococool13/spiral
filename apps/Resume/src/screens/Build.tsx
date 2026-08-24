import { useEffect, useState } from "react";
import { buildDocument } from "../lib/ipc";
import type { BuildResult, Draft, Progress } from "../lib/types";
import { Notice } from "../components/Notice";

const STAGE_FLOOR_MS = 400;

/** Each named stage stays on screen long enough to be read. The percentages
 *  still come from Rust after the work that earned them. */
export function Build({
  draft,
  aim = "",
  onDone,
  onBack,
}: {
  draft: Draft;
  aim?: string;
  onDone: (result: BuildResult) => void;
  onBack: () => void;
}) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    let chain = Promise.resolve();

    function hold(next: Progress) {
      chain = chain.then(
        () =>
          new Promise<void>((resolve) => {
            window.setTimeout(() => {
              if (current) setProgress(next);
              resolve();
            }, STAGE_FLOOR_MS);
          }),
      );
    }

    buildDocument(
      draft,
      (next) => {
        hold(next);
      },
      aim,
    )
      .then(async (result) => {
        await chain;
        await new Promise<void>((resolve) => window.setTimeout(resolve, STAGE_FLOOR_MS));
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
        <Notice tone="warn">{error}</Notice>
        <div className="panel__actions">
          <button type="button" className="btn" onClick={onBack}>
            Choose a format
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
