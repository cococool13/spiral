import { useEffect, useState } from "react";
import { downloadOfflineModel, offlineModelStatus, removeOfflineModel } from "../lib/ipc";
import type { DownloadProgress, ModelStatus } from "../lib/types";
import { Notice } from "./Notice";

/** The offline tier. The size is stated before anything is fetched, the bar
 *  measures real bytes, and nothing downloads unless the user asks. */
export function OfflineModel() {
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    offlineModelStatus()
      .then(setStatus)
      .catch((e) => setError(`${e}`));
  }, []);

  async function download() {
    setError("");
    setProgress({ received: 0, total: 0, percent: 0 });
    try {
      setStatus(await downloadOfflineModel(setProgress));
    } catch (e) {
      setError(`${e}`);
    } finally {
      setProgress(null);
    }
  }

  async function remove() {
    setError("");
    try {
      setStatus(await removeOfflineModel());
    } catch (e) {
      setError(`${e}`);
    }
  }

  if (!status) return null;

  return (
    <>
      <h3 className="panel__heading">Offline model</h3>

      {!status.available ? (
        <p className="panel__lede">
          This build does not include an offline model. The free rule-based pass and your own API
          key both still work.
        </p>
      ) : (
        <>
          <p className="panel__lede">
            {status.name} — a {status.size} download, once. After that, wording is rewritten on
            this computer and nothing leaves it. It is slower than an API key and about as good.
          </p>

          {status.installed ? <p className="path">{status.path}</p> : null}

          {progress ? (
            <>
              <p className="build__stage" aria-live="polite">
                Downloading {status.size}…
              </p>
              <progress
                className="build__bar"
                max={100}
                value={progress.percent}
                aria-label="Download progress"
              />
              <p className="build__percent">{progress.percent}%</p>
            </>
          ) : null}
        </>
      )}

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {status.available ? (
        <div className="panel__actions">
          {status.installed ? (
            <button type="button" className="btn" onClick={remove}>
              Remove the offline model
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              disabled={progress !== null}
              onClick={download}
            >
              Download it ({status.size})
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}
