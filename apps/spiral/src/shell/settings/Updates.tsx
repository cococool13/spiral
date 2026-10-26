import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { Button } from "../../ui/Button";
import { Toggle } from "../../ui/Toggle";
import { generalUpdate, type GeneralSettings } from "./api";

type Phase = "idle" | "checking" | "current" | "found" | "installing" | "failed";

interface UpdatesProps {
  settings: GeneralSettings;
  knownUpdate: Update | null;
  onSettings: (next: GeneralSettings) => void;
  onUpdateFound: (update: Update) => void;
}

export function Updates({ settings, knownUpdate, onSettings, onUpdateFound }: UpdatesProps) {
  const [version, setVersion] = useState("");
  const [found, setFound] = useState<Update | null>(knownUpdate);
  const [phase, setPhase] = useState<Phase>(knownUpdate ? "found" : "idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => setVersion(""));
  }, []);

  useEffect(() => {
    if (knownUpdate && !found) {
      setFound(knownUpdate);
      setPhase("found");
    }
  }, [knownUpdate, found]);

  async function runCheck() {
    setPhase("checking");
    try {
      const next = await check();
      if (next) {
        setFound(next);
        onUpdateFound(next);
        setPhase("found");
      } else {
        setPhase("current");
      }
    } catch {
      setPhase("failed");
    }
  }

  async function runInstall() {
    if (!found) return;
    setPhase("installing");
    try {
      await found.downloadAndInstall();
      await relaunch();
    } catch {
      setPhase("failed");
    }
  }

  async function toggleCheck(autoUpdateCheck: boolean) {
    const previous = settings;
    const next = { ...settings, autoUpdateCheck };
    onSettings(next);
    setError(null);
    try {
      onSettings(await generalUpdate(next));
    } catch {
      onSettings(previous);
      setError("That setting did not save. Try again.");
    }
  }

  const versionLine = version ? `Version ${version}.` : "";
  const detail =
    phase === "checking"
      ? `${versionLine} Asking GitHub.`
      : phase === "current"
        ? `${versionLine} This is the latest version.`
        : phase === "found" && found
          ? `Spiral ${found.version} is ready.`
          : phase === "installing"
            ? "Downloading the update. Spiral restarts when it finishes."
            : phase === "failed"
              ? "The update check didn't reach GitHub. Check your network, then try again."
              : versionLine;

  return (
    <div className="set">
      {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
      <section className="set-row">
        <div className="set-row__copy">
          <h2>Automatic update check</h2>
        </div>
        <Toggle
          checked={settings.autoUpdateCheck}
          label="Automatic update check"
          onChange={(next) => void toggleCheck(next)}
        />
      </section>
      <section className="set-row">
        <div className="set-row__copy">
          <h2>Updates</h2>
          <p className="notice" aria-live="polite">
            {detail}
          </p>
        </div>
        {phase === "found" || phase === "installing" ? (
          <Button variant="primary" disabled={phase === "installing"} onClick={() => void runInstall()}>
            {phase === "installing" ? "Installing" : "Update and restart"}
          </Button>
        ) : (
          <Button disabled={phase === "checking"} onClick={() => void runCheck()}>
            {phase === "checking" ? "Checking…" : "Check for updates"}
          </Button>
        )}
      </section>
    </div>
  );
}
