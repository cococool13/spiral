import type { ModuleId } from "../boot";
import { PillDocGlyph, PillImageGlyph } from "../ui/glyphs";
import type { ModuleBundle } from "./types";

type Glyph = typeof PillImageGlyph;

export interface ModuleDef {
  title: string;
  Glyph: Glyph;
  load: () => Promise<ModuleBundle>;
}

export const MODULES = {
  wallpaper: {
    title: "Wallpaper",
    Glyph: PillImageGlyph,
    load: () => import("./wallpaper"),
  },
  resume: {
    title: "Resume",
    Glyph: PillDocGlyph,
    load: () => import("./resume"),
  },
} satisfies Record<ModuleId, ModuleDef>;
