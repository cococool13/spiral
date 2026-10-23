import { invoke } from "@tauri-apps/api/core";
import { checkoutUrl } from "../analytics/client";

export function openExternal(url: string): void {
  void checkoutUrl(url).then((next) => {
    void invoke("plugin:opener|open_url", { url: next });
  });
}
