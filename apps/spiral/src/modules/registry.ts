import type { ModuleId } from "../boot";
import { ResumeGlyph, WallpaperGlyph } from "../ui/glyphs";
import type { ModuleBundle } from "./types";

type Glyph = typeof WallpaperGlyph;

export interface ModuleDef {
  title: string;
  Glyph: Glyph;
  load: () => Promise<ModuleBundle>;
}

export const MODULES = {
  wallpaper: {
    title: "Wallpaper",
    Glyph: WallpaperGlyph,
    load: () => import("./wallpaper"),
  },
  resume: {
    title: "Resume",
    Glyph: ResumeGlyph,
    load: () => import("./resume"),
  },
} satisfies Record<ModuleId, ModuleDef>;
