import { invoke } from "@tauri-apps/api/core";

export interface RenameOffer {
  visible: boolean;
  otherCopy: string | null;
}

export function parseRenameOffer(value: unknown): RenameOffer {
  if (!isRecord(value) || typeof value.visible !== "boolean") {
    throw new Error("Spiral could not read the rename offer.");
  }
  if (value.otherCopy !== null && typeof value.otherCopy !== "string") {
    throw new Error("Spiral could not read the rename offer.");
  }
  return { visible: value.visible, otherCopy: value.otherCopy };
}

export function renameOffer(): Promise<RenameOffer> {
  return invoke("rename_offer").then(parseRenameOffer);
}

export function renameDecline(): Promise<void> {
  return invoke("rename_decline");
}

export function renameApply(): Promise<void> {
  return invoke("rename_apply");
}

export function trashCopy(path: string): Promise<void> {
  return invoke("bundle_trash", { path });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
