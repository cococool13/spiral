#!/usr/bin/env node
// Wallpaper and Clean share one AppBar. Resume may diverge (bar__brand).
// Fail if Wallpaper and Clean drift — that copy is the shallow seam this
// check keeps honest until a real shared package exists.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const a = readFileSync(resolve(ROOT, "apps/wallpaper/src/components/AppBar.tsx"), "utf8");
const b = readFileSync(resolve(ROOT, "apps/clean/src/components/AppBar.tsx"), "utf8");

if (a !== b) {
  console.error(
    "check-app-bar: apps/wallpaper and apps/clean AppBar.tsx differ.\n" +
      "Keep them identical, or document a deliberate fork in both files.",
  );
  process.exit(1);
}
console.log("check-app-bar: Wallpaper and Clean AppBar match");
