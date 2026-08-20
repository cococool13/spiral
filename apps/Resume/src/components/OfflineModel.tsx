import { useEffect, useRef, useState } from "react";
import {
  chooseOfflineModel,
  downloadOfflineModel,
  offlineModelStatus,
  removeOfflineModel,
} from "../lib/ipc";
import type { DownloadProgress, ModelList, ModelStatus } from "../lib/types";
import { Notice } from "./Notice";

/**
 * The offline tier. Several models, one axis: the bigger one writes better and
 * the smaller one runs on more machines, so the choice is the user's and every
 * size is stated before a byte is fetched.
 *
 * Nothing downloads unless it is asked for, the bar measures real bytes, and
 * downloading a model chooses it — nobody fetches gigabytes they did not mean
 * to use.
 */
export function OfflineModel({
  autoDownloadId,
  onInstalled,
}: {
  autoDownloadId?: string;
  onInstalled?: () => void;
} = {}) {
  const [list, setList] = useState<ModelList | null>(null);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState("");

  const started = useRef(false);

  useEffect(() => {
    offlineModelStatus()
      .then(setList)
      .catch((e) => setError(`${e}`));
  }, []);

  useEffect(() => {
    if (!autoDownloadId || !list || started.current) return;
    const model = list.models.find((entry) => entry.id === autoDownloadId);
    if (!model) return;
    if (model.installed) {
      started.current = true;
      onInstalled?.();
      return;
    }
    started.current = true;
    void run(model.id, () => {
      setProgress({ received: 0, total: 0, percent: 0 });
      return downloadOfflineModel(model.id, setProgress);
    }).then((next) => {
      if (next?.models.some((entry) => entry.installed && entry.inUse)) onInstalled?.();
    });
  }, [autoDownloadId, list, onInstalled]);

  async function run(id: string, work: () => Promise<ModelList>) {
    setError("");
    setBusy(id);
    try {
      const next = await work();
      setList(next);
      return next;
    } catch (e) {
      setError(`${e}`);
      return null;
    } finally {
      setBusy("");
      setProgress(null);
    }
  }

  const download = (model: ModelStatus) =>
    run(model.id, () => {
      setProgress({ received: 0, total: 0, percent: 0 });
      return downloadOfflineModel(model.id, setProgress);
    });

  if (!list) return null;

  if (!list.available) {
    return (
      <>
        <h3 className="panel__heading">Offline model</h3>
        <p className="panel__lede">
          This build includes no offline model. The free rule-based pass and your own API key both
          still work.
        </p>
      </>
    );
  }

  const installed = list.models.filter((model) => model.installed).length;

  return (
    <>
      <h3 className="panel__heading">Offline model</h3>
      <p className="panel__lede">
        One download, once. After that, wording is rewritten on this computer and nothing leaves
        it. Bigger models write better and need more memory; the smallest runs almost anywhere.
      </p>

      <ul className="models">
        {list.models.map((model) => (
          <li className="model" key={model.id}>
            <div className="model__head">
              <span className="model__name">{model.name}</span>
              <span className="model__size">{model.size}</span>
              {model.inUse ? <span className="model__in-use">In use</span> : null}
            </div>
            {model.note ? <p className="model__note">{model.note}</p> : null}
            {model.installed ? <p className="path">{model.path}</p> : null}

            {busy === model.id && progress ? (
              <>
                <p className="build__stage" aria-live="polite">
                  Downloading {model.size}…
                </p>
                <progress
                  className="build__bar"
                  max={100}
                  value={progress.percent}
                  aria-label={`${model.name} download progress`}
                />
                <p className="build__percent">{progress.percent}%</p>
              </>
            ) : (
              <div className="model__actions">
                {model.installed ? (
                  <>
                    {/* Only offered when it would change something: with one
                        model installed there is nothing to choose between. */}
                    {!model.inUse && installed > 1 ? (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy !== ""}
                        onClick={() => run(model.id, () => chooseOfflineModel(model.id))}
                      >
                        Use this one
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn"
                      disabled={busy !== ""}
                      onClick={() => run(model.id, () => removeOfflineModel(model.id))}
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy !== ""}
                    onClick={() => download(model)}
                  >
                    Download ({model.size})
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {error ? <Notice tone="warn">{error}</Notice> : null}
    </>
  );
}
