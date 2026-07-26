// Build the square icon source Tauri needs from the brand mark.
//
// /brand/logo/png/mark-*.png is the bare mark: tall and narrow (637x1024).
// Copying it straight into src-tauri/icons produced 80x128 and 20x32 files —
// wrong aspect, wrong size, and no .icns at all. macOS wants a square canvas
// with the glyph centred and breathing room around it, which is what
// apps/wallpaper's icon does.
//
// sips does both steps, and `-c` (crop to size) pads with transparency where
// `-p` (pad) fills with an opaque colour.
//
//   1. -Z 820      scale the longest side to 80% of 1024
//   2. -c 1024 1024 centre it on a transparent 1024 square
//
// Then `pnpm tauri icon` fans that out to every size plus icon.icns and
// icon.ico. Run `pnpm icon` after changing the mark.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, "../../../../brand/logo/png/mark-1024.png");
const iconsDir = path.resolve(here, "../src-tauri/icons");
const out = path.join(iconsDir, "icon-source.png");

const CANVAS = 1024;
/** Fraction of the canvas the mark occupies. Matches apps/wallpaper. */
const INSET = 0.8;

if (process.platform !== "darwin") {
  console.error("make-icon: sips is macOS-only. Run this on a Mac.");
  process.exit(1);
}
if (!existsSync(source)) {
  console.error(`make-icon: ${source} is missing.`);
  process.exit(1);
}

const scratch = mkdtempSync(path.join(tmpdir(), "spiral-slim-icon-"));
try {
  const scaled = path.join(scratch, "scaled.png");
  mkdirSync(iconsDir, { recursive: true });
  execFileSync("sips", [
    "-Z", String(Math.round(CANVAS * INSET)),
    source,
    "--out", scaled,
  ], { stdio: "ignore" });
  execFileSync("sips", [
    "-c", String(CANVAS), String(CANVAS),
    scaled,
    "--out", out,
  ], { stdio: "ignore" });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// Fail loudly rather than hand tauri a source that is still the wrong shape.
const probe = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", out], {
  encoding: "utf8",
});
const width = Number(/pixelWidth:\s*(\d+)/.exec(probe)?.[1]);
const height = Number(/pixelHeight:\s*(\d+)/.exec(probe)?.[1]);
if (width !== CANVAS || height !== CANVAS) {
  console.error(`make-icon: produced ${width}x${height}, expected ${CANVAS} square.`);
  process.exit(1);
}

execFileSync("pnpm", ["exec", "tauri", "icon", out], {
  cwd: path.resolve(here, ".."),
  stdio: "inherit",
});
console.log(`make-icon: ${CANVAS}x${CANVAS} source and full icon set written to src-tauri/icons`);
