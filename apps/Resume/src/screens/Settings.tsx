import { useEffect, useState } from "react";
import { deleteStoredData, storageInfo } from "../lib/ipc";

export function Settings({
  onClose,
  onCleared,
}: {
  onClose: () => void;
  onCleared: () => void;
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

      <h3 className="panel__heading">Stored on this machine</h3>
      <p className="panel__lede">
        Your resume is saved here and nowhere else. It is never uploaded and never synced.
      </p>
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
