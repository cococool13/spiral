import { useEffect, useState } from "react";
import { licenseView } from "./api";
import type { LicenseView } from "./types";

const UNREAD: LicenseView = {
  kind: "locked",
  message: "Spiral could not check the license. Close the window and open it again.",
};

export function useLicense(): [LicenseView, (view: LicenseView) => void] {
  const [view, setView] = useState<LicenseView>({ kind: "checking" });

  useEffect(() => {
    let live = true;
    void licenseView()
      .then((next) => {
        if (live) setView(next);
      })
      .catch(() => {
        if (live) setView(UNREAD);
      });
    return () => {
      live = false;
    };
  }, []);

  return [view, setView];
}
