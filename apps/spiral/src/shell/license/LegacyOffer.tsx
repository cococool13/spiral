import type { BootState } from "../../boot";
import { Button } from "../../ui/Button";
import { legacyName, type LegacyApp } from "./types";

interface LegacyOfferProps {
  offer: LegacyApp;
  platform: BootState["platform"];
  busy: boolean;
  error: string | null;
  onUseKey: () => void;
  onEmail: () => void;
}

export function LegacyOffer({ offer, platform, busy, error, onUseKey, onEmail }: LegacyOfferProps) {
  return (
    <main className="stage">
      <h1>Activate Spiral</h1>
      <p className="notice">Spiral found your key from {legacyName(offer)}.</p>
      {platform === "macos" ? (
        <p className="notice">macOS will ask to let Spiral read it.</p>
      ) : null}
      <Button variant="primary" size="large" disabled={busy} onClick={onUseKey}>
        Use this key
      </Button>
      <button type="button" className="link" disabled={busy} onClick={onEmail}>
        Use email instead
      </button>
      {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
    </main>
  );
}
