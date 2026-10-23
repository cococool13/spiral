import type { ReactNode } from "react";
import { Notice as ShellNotice } from "../../../ui/Notice";

export function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  return <ShellNotice tone={tone === "warn" ? "error" : "info"}>{children}</ShellNotice>;
}
