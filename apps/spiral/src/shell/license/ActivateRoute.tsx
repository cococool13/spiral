import { useState } from "react";
import type { BootState } from "../../boot";
import { Activate } from "../../screens/Activate";
import { licenseUseLegacy, licenseView } from "./api";
import { legacyName, type LicenseView } from "./types";

interface ActivateRouteProps {
  view: LicenseView;
  platform: BootState["platform"];
  onView: (view: LicenseView) => void;
}

export function ActivateRoute({ view, platform, onView }: ActivateRouteProps) {
  const offer = view.kind === "needsActivation" ? view.offer : null;
  const [emailInstead, setEmailInstead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(view.kind === "locked" ? view.message : null);

  async function refresh() {
    try {
      onView(await licenseView());
    } catch {
      onView({
        kind: "locked",
        message: "Spiral could not check the license. Close the window and open it again.",
      });
    }
  }

  async function useKey() {
    if (!offer || busy) return;
    setBusy(true);
    setError(null);
    try {
      onView(await licenseUseLegacy(offer));
    } catch (caught) {
      setEmailInstead(true);
      setError(
        typeof caught === "string"
          ? caught
          : "Spiral could not read that key. Use email instead.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (offer && !emailInstead) {
    return (
      <main className="picker">
        <div className="picker__head">
          <h1>Activate Spiral</h1>
          <p className="picker__line">Spiral found your key from {legacyName(offer)}.</p>
          {platform === "macos" ? (
            <p className="picker__line">macOS will ask to let Spiral read it.</p>
          ) : null}
        </div>
        <div className="picker__foot">
          <button type="button" className="picker__go" disabled={busy} onClick={() => void useKey()}>
            Use this key
          </button>
          <button
            type="button"
            className="picker__link"
            disabled={busy}
            onClick={() => setEmailInstead(true)}
          >
            Use email instead
          </button>
          {error ? (
            <p className="picker__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <div className="app">
      {error ? (
        <p className="activate__error activate-route__notice" role="alert">
          {error}
        </p>
      ) : null}
      <Activate
        onDone={() => {
          void refresh();
        }}
      />
    </div>
  );
}
