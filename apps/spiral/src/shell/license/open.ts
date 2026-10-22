import { invoke } from "@tauri-apps/api/core";

export function openExternal(url: string): void {
  void invoke("plugin:opener|open_url", { url });
}
