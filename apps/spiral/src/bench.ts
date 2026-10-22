import { invoke } from "@tauri-apps/api/core";
import { benchEnabled } from "./boot";

const sent = new Set<string>();

export function mark(name: string): void {
  if (!benchEnabled() || sent.has(name)) return;
  sent.add(name);
  void invoke("bench_mark", { mark: name }).catch(() => {
    sent.delete(name);
  });
}
