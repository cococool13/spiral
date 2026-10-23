import type { ComponentType, ReactNode } from "react";

export interface ModuleProps {
  setStatus: (line: string) => void;
  onChooseWallpaper: () => void;
}

export interface ModuleBundle {
  default: ComponentType<ModuleProps>;
  Frame: ComponentType<{ children: ReactNode }>;
  Toolbar: ComponentType;
}
