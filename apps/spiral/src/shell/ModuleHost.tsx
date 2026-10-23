import { useEffect, useState, type ReactNode } from "react";
import type { ModuleId } from "../boot";
import { MODULES } from "../modules/registry";
import type { ModuleBundle } from "../modules/types";

export function useModuleBundle(id: ModuleId | null): ModuleBundle | null {
  const [bundle, setBundle] = useState<ModuleBundle | null>(null);

  useEffect(() => {
    if (!id) {
      setBundle(null);
      return;
    }
    let live = true;
    setBundle(null);
    void MODULES[id].load().then((loaded) => {
      if (live) setBundle(loaded);
    });
    return () => {
      live = false;
    };
  }, [id]);

  return bundle;
}

export function ModuleHost({ bundle, children }: { bundle: ModuleBundle; children: ReactNode }) {
  const Frame = bundle.Frame;
  return <Frame>{children}</Frame>;
}
