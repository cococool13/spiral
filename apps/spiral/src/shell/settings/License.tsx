import { ProviderPaste } from "../license/ProviderPaste";
import type { LicenseView } from "../license/types";

interface LicenseProps {
  view: LicenseView;
}

export function License({ view }: LicenseProps) {
  const line =
    view.kind === "licensed" && view.grace
      ? "Spiral could not reach its license server. This Mac stays licensed for now."
      : view.kind === "licensed"
        ? "This Mac is licensed."
        : view.kind === "locked"
          ? view.message
          : "Checking the license.";

  return (
    <div className="set">
      <p className="notice">{line}</p>
      <ProviderPaste provider="anthropic" label="Anthropic" />
      <ProviderPaste provider="openai" label="OpenAI" />
      <ProviderPaste provider="compatible" label="Compatible" />
    </div>
  );
}
