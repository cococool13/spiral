import type { GalleryItem } from "./types";

export type Rendition = "sm" | "lg";
export type ThumbPlatform = "macos" | "windows";

export function renditionFor(devicePxLongEdge: number): Rendition {
  return devicePxLongEdge <= 480 ? "sm" : "lg";
}

export function thumbSrc(id: GalleryItem["id"], rendition: Rendition, platform: ThumbPlatform): string {
  if (import.meta.env.DEV) {
    const paint = (globalThis as { __SPIRAL_THUMB__?: (id: string) => string }).__SPIRAL_THUMB__;
    if (typeof paint === "function") return paint(id);
  }
  if (platform === "windows") {
    return `http://thumb.localhost/${id}?r=${rendition}`;
  }
  return `thumb://localhost/${id}?r=${rendition}`;
}
