import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../ui/Button";
import { Notice } from "../../ui/Notice";
import { Segmented } from "../../ui/Segmented";
import { Toggle } from "../../ui/Toggle";
import { setSharing } from "../analytics/client";
import { generalUpdate, type FitMode, type GeneralSettings } from "./api";
import { renameApply, renameDecline, renameOffer, trashCopy, type RenameOffer } from "./rename";

const FIT: { value: FitMode; label: string }[] = [
  { value: "fill", label: "Fill" },
  { value: "fit", label: "Fit" },
  { value: "center", label: "Center" },
];

interface GeneralProps {
  settings: GeneralSettings;
  onSettings: (next: GeneralSettings) => void;
}

export function General({ settings, onSettings }: GeneralProps) {
  const [offer, setOffer] = useState<RenameOffer | null>(null);
  const [cacheBytes, setCacheBytes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function refreshOffer() {
    void renameOffer()
      .then(setOffer)
      .catch(() => setOffer({ visible: false, otherCopy: null }));
  }

  useEffect(() => {
    refreshOffer();
    void invoke<number>("thumb_cache_size")
      .then(setCacheBytes)
      .catch(() => setCacheBytes(null));
  }, []);

  async function patch(next: GeneralSettings) {
    const previous = settings;
    const sharingChanged = next.analyticsOptOut !== previous.analyticsOptOut;
    if (sharingChanged) setSharing(!next.analyticsOptOut);
    onSettings(next);
    setError(null);
    try {
      onSettings(await generalUpdate(next));
    } catch {
      if (sharingChanged) setSharing(!previous.analyticsOptOut);
      onSettings(previous);
      setError("That setting did not save. Try again.");
    }
  }

  async function clearCache() {
    setError(null);
    try {
      await invoke("clear_thumb_cache");
      setCacheBytes(await invoke<number>("thumb_cache_size"));
    } catch {
      setError("Spiral could not clear the cache. Try again.");
    }
  }

  async function applyRename() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await renameApply();
    } catch (caught) {
      setError(typeof caught === "string" ? caught : "Spiral could not rename the app. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function keepName() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await renameDecline();
      refreshOffer();
    } catch {
      setError("Spiral could not save that choice. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function trash(path: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await trashCopy(path);
      refreshOffer();
    } catch (caught) {
      setError(
        typeof caught === "string" ? caught : "Spiral could not move that copy to the Trash.",
      );
    } finally {
      setBusy(false);
    }
  }

  const stored =
    cacheBytes === null ? "The cap is 200 MB." : `${(cacheBytes / 1048576).toFixed(1)} MB stored. The cap is 200 MB.`;

  return (
    <div className="set">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <section className="set-row">
        <div className="set-row__copy">
          <h2>Share anonymous usage stats</h2>
          <p className="notice" id="usage-stats">
            Anonymous and privacy-safe. No personal data or content, IP discarded.
          </p>
        </div>
        <Toggle
          checked={!settings.analyticsOptOut}
          label="Share anonymous usage stats"
          describedBy="usage-stats"
          onChange={(share) => void patch({ ...settings, analyticsOptOut: !share })}
        />
      </section>
      <section className="set-row">
        <div className="set-row__copy">
          <h2>Launch at login</h2>
        </div>
        <Toggle
          checked={settings.launchAtLogin}
          label="Launch at login"
          onChange={(launchAtLogin) => void patch({ ...settings, launchAtLogin })}
        />
      </section>
      <section className="set-row">
        <div className="set-row__copy">
          <h2>Wallpaper fit</h2>
          <p className="notice">Used the next time you set a wallpaper.</p>
        </div>
        <Segmented
          label="Wallpaper fit"
          value={settings.fitMode}
          options={FIT}
          onChange={(fitMode) => void patch({ ...settings, fitMode })}
        />
      </section>
      <section className="set-row">
        <div className="set-row__copy">
          <h2>Thumbnail cache</h2>
          <p className="notice">{stored}</p>
        </div>
        <Button onClick={() => void clearCache()}>Clear</Button>
      </section>
      {offer?.visible ? (
        <section className="set-row">
          <div className="set-row__copy">
            <h2>App name</h2>
            <p className="notice">This copy is named Spiral Wallpaper.</p>
          </div>
          <div className="set-row__actions">
            <Button variant="primary" disabled={busy} onClick={() => void applyRename()}>
              Rename this app to Spiral
            </Button>
            <Button disabled={busy} onClick={() => void keepName()}>
              Keep this name
            </Button>
          </div>
        </section>
      ) : null}
      {offer?.otherCopy ? (
        <section className="set-row">
          <div className="set-row__copy">
            <h2>Another copy</h2>
            <p className="notice">Another copy of Spiral is at {offer.otherCopy}.</p>
          </div>
          <Button disabled={busy} onClick={() => void trash(offer.otherCopy as string)}>
            Move to Trash
          </Button>
        </section>
      ) : null}
    </div>
  );
}
