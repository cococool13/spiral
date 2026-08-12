import { useEffect, useState } from "react";
import { EngineSettings } from "../components/EngineSettings";
import { deleteStoredData, storageInfo } from "../lib/ipc";
import type { EngineInfo } from "../lib/types";

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
      <h2 className="panel__title">Settings</h2>

      <EngineSettings onChanged={onEngineChanged} />

      <h3 className="panel__heading">Stored on this machine</h3>
      <p className="panel__lede">Never uploaded, never synced.</p>
      <p className="path">{path}</p>

      {error ? <p className="notice notice--warn">{error}</p> : null}

      <div className="panel__actions">
        {confirming ? (
          <>
            <button type="button" className="btn btn--primary" onClick={remove}>
              Delete it
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(false)}>
              Keep it
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
