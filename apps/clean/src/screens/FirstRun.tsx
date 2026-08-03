import { invoke } from "@tauri-apps/api/core";

export default function FirstRun({ onRecheck }: { onRecheck: () => void }) {
  return (
    <section>
      <h1>Spiral Clean needs Full Disk Access</h1>
      <p>
        Without it, macOS hides most caches from this app and scans come back
        nearly empty. Spiral Clean reads only what you ask it to and sends
        nothing anywhere.
      </p>
      <p>
        <strong>macOS will quit Spiral Clean the moment you grant access.</strong>{" "}
        That is expected. Reopen it and you are done.
      </p>
      <button type="button" onClick={() => invoke("open_privacy_settings")}>
        Open System Settings
      </button>
      <button type="button" onClick={onRecheck}>
        I have granted access
      </button>
    </section>
  );
}
