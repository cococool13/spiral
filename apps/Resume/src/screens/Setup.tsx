import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { OfflineModel } from "../components/OfflineModel";
import { Notice } from "../components/Notice";
import { completeSetup, saveApiKey, saveEngine } from "../lib/ipc";
import type { EngineInfo } from "../lib/types";

const KEY_URLS: Record<string, string> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
};

/** First launch: pick how wording is rewritten before any resume is imported.
 *  A download starts only after a model is chosen. Skip is the rule-based pass. */
export function Setup({ onDone }: { onDone: (info: EngineInfo) => void }) {
  const [path, setPath] = useState<"" | "local" | "key">("");
  const [provider, setProvider] = useState("anthropic");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function finish(work: () => Promise<EngineInfo>) {
    setBusy(true);
    setError("");
    try {
      onDone(await work());
    } catch (e) {
      setError(`${e}`);
    } finally {
      setBusy(false);
    }
  }

  if (path === "local") {
    return (
      <section className="stage">
        <h2 className="panel__title">Download a model</h2>
        <p className="panel__lede">
          The 4B model is the one to pick if it fits — choose it below. After it
          is on this computer, wording is rewritten here and nothing leaves.
        </p>
        <OfflineModel
          onInstalled={() =>
            void finish(async () => {
              await saveEngine("local", "", "");
              return completeSetup();
            })
          }
        />
        {busy ? <Notice>Saving your choice…</Notice> : null}
        {error ? <Notice tone="warn">{error}</Notice> : null}
        <div className="panel__actions">
          <button type="button" className="btn" disabled={busy} onClick={() => setPath("")}>
            Back
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void finish(completeSetup)}
          >
            Continue with rules only
          </button>
        </div>
      </section>
    );
  }

  if (path === "key") {
    return (
      <section className="stage">
        <h2 className="panel__title">Use your own key</h2>
        <p className="panel__lede">
          This is an API key, not your Claude or ChatGPT subscription — they are billed separately.
          The key stays in this computer&apos;s keychain.
        </p>
        <label className="field">
          <span className="field__label">Service</span>
          <select
            className="field__input"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="anthropic">Claude</option>
            <option value="openai">ChatGPT</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">Paste your key</span>
          <input
            className="field__input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        {key.trim().length === 0 ? <Notice>Paste your key to continue.</Notice> : null}
        {busy ? <Notice>Saving your choice…</Notice> : null}
        {error ? <Notice tone="warn">{error}</Notice> : null}
        <div className="panel__actions">
          <button
            type="button"
            className="btn btn--primary"
            aria-disabled={key.trim().length === 0 || undefined}
            disabled={busy}
            onClick={() => {
              if (key.trim().length === 0) return;
              void finish(async () => {
                await saveEngine(provider, "", "");
                return saveApiKey(key);
              });
            }}
          >
            Save the key and continue
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const url = KEY_URLS[provider];
              if (!url) return;
              void openUrl(url).catch((e) => setError(`${e}`));
            }}
          >
            Get your key
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => setPath("")}>
            Back
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="stage">
      <h2 className="panel__title">Optional: a model for tightening</h2>
      <p className="panel__lede">
        A style restyles the page. Facts never change. Tightening is a switch on Check.
        A model on this computer, if you download one, does that work here.
      </p>
      <div className="stage-tiles">
        <button type="button" className="stage-tile" onClick={() => setPath("local")}>
          <span className="stage-tile__name">Download a model</span>
          <span className="stage-tile__note">
            Runs on this computer. About 3 GB for the recommended size. Starts as soon as you pick
            one.
          </span>
        </button>
        <button type="button" className="stage-tile" onClick={() => setPath("key")}>
          <span className="stage-tile__name">Use Claude or ChatGPT</span>
          <span className="stage-tile__note">
            Your own API key. Cleaner writing than the on-computer models. Billed by them, not by
            Spiral.
          </span>
        </button>
        <button
          type="button"
          className="stage-tile"
          disabled={busy}
          onClick={() => void finish(completeSetup)}
        >
          <span className="stage-tile__name">Rules only</span>
          <span className="stage-tile__note">
            No download, no key. Style your resume as written. Turn tightening on later for
            built-in rules, or come back and download a model.
          </span>
        </button>
      </div>
      {busy ? <Notice>Saving your choice…</Notice> : null}
      {error ? <Notice tone="warn">{error}</Notice> : null}
    </section>
  );
}
