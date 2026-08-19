import { useEffect, useState } from "react";
import { version } from "../../package.json";
import { EngineSettings } from "../components/EngineSettings";
import { deleteStoredData, storageInfo } from "../lib/ipc";
import type { EngineInfo } from "../lib/types";
import { Notice } from "../components/Notice";

export function Settings({
  onClose,
  onCleared,
  onEngineChanged,
}: {
  onClose: () => void;
  onCleared: () => void;
  onEngineChanged: (info: EngineInfo) => void;
}) {
  const [path, setPath] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    storageInfo()
      .then((info) => setPath(info.path))
      .catch((e) => setError(`${e}`));
  }, []);

  async function remove() {
    try {
      await deleteStoredData();
      setConfirming(false);
      onCleared();
    } catch (e) {
      setError(`${e}`);
    }
  }

  return (
    <section className="panel">
      {/* Opening Settings swaps the whole main region, so focus has to follow
          it — otherwise a keyboard user is still standing in the flow behind. */}
      <h2 className="panel__title" tabIndex={-1} ref={(node) => node?.focus()}>
        Settings
      </h2>
      <p className="panel__lede">Spiral Resume {version}</p>

      <EngineSettings onChanged={onEngineChanged} />

      <h3 className="panel__heading">Stored on this machine</h3>
      <p className="panel__lede">Never uploaded, never synced.</p>
      <p className="path">{path}</p>

      {error ? <Notice tone="warn">{error}</Notice> : null}

      <div className="panel__actions">
        {confirming ? (
          <>
            <button type="button" className="btn btn--primary" onClick={() => setConfirming(false)}>
              Keep it
            </button>
            <button type="button" className="btn" onClick={remove}>
              Delete it
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirming(true)}>
            Delete everything Spiral Resume has stored
          </button>
        )}
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  );
}
