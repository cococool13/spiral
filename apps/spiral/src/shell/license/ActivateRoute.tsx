import { useState } from "react";
import type { BootState } from "../../boot";
import { licenseRetry, licenseUseLegacy, licenseView } from "./api";
import { Activate } from "./Activate";
import { LegacyOffer } from "./LegacyOffer";
import type { LicenseView } from "./types";
import { Button } from "../../ui/Button";

interface ActivateRouteProps {
  view: LicenseView;
  platform: BootState["platform"];
  onView: (view: LicenseView) => void;
}

export function ActivateRoute({ view, platform, onView }: ActivateRouteProps) {
  const offer = view.kind === "needsActivation" ? view.offer : null;
  const [emailInstead, setEmailInstead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    view.kind === "locked" || view.kind === "retry" ? view.message : null,
  );

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

  async function refreshRetry() {
    if (busy) return;
    setBusy(true);
    try {
      onView(await licenseRetry());
    } catch {
      onView({
        kind: "retry",
        message: "Spiral could not check the license. Try again.",
      });
    } finally {
      setBusy(false);
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
      setError(typeof caught === "string" ? caught : "Spiral could not read that key. Use email instead.");
    } finally {
      setBusy(false);
    }
  }

  if ((view.kind === "locked" || view.kind === "retry") && !offer) {
    return (
      <>
        <p className="notice notice--error activate-route__notice" role="alert">
          {view.message}
        </p>
        {view.kind === "retry" ? (
          <p className="activate-route__retry">
            <Button type="button" onClick={() => void refreshRetry()} disabled={busy}>
              Try again
            </Button>
          </p>
        ) : null}
        <Activate
          onDone={() => {
            void refresh();
          }}
        />
      </>
    );
  }

  if (offer && !emailInstead) {
    return (
      <LegacyOffer
        offer={offer}
        platform={platform}
        busy={busy}
        error={error}
        onUseKey={() => void useKey()}
        onEmail={() => setEmailInstead(true)}
      />
    );
  }

  return (
    <>
      {error ? <p className="notice notice--error activate-route__notice" role="alert">{error}</p> : null}
      <Activate
        onDone={() => {
          void refresh();
        }}
      />
    </>
  );
}
