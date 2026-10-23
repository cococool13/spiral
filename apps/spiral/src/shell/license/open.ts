import { invoke } from "@tauri-apps/api/core";
import { checkoutUrl } from "../analytics/client";

const OPEN_FAILED = "Spiral could not open that page.";

export function openExternal(url: string, onError?: (message: string) => void): void {
  void checkoutUrl(url)
    .then((next) => invoke("plugin:opener|open_url", { url: next }))
    .catch(() => onError?.(OPEN_FAILED));
}
