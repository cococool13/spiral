import type { GalleryItem } from "./types";

export type Rendition = "sm" | "lg";
export type ThumbPlatform = "macos" | "windows";

export function renditionFor(devicePxLongEdge: number): Rendition {
  return devicePxLongEdge <= 480 ? "sm" : "lg";
}

export function thumbSrc(id: GalleryItem["id"], rendition: Rendition, platform: ThumbPlatform): string {
  if (platform === "windows") {
    return `http://thumb.localhost/${id}?r=${rendition}`;
  }
  return `thumb://localhost/${id}?r=${rendition}`;
}
