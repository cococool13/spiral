import type { ComponentType, ReactNode } from "react";

export interface ModuleProps {
  setStatus: (line: string) => void;
  onChooseWallpaper: () => void;
}

export interface ModuleBundle {
  default: ComponentType<ModuleProps>;
  /** Holds the module's state, so the pill and the dome can reach it. */
  Frame: ComponentType<{ children: ReactNode }>;
  /** Recessed icon buttons the module adds to the left of the pill. */
  Tools: ComponentType;
  /** The round dome beside the pill: the module's one main action. */
  Dome: ComponentType;
}
