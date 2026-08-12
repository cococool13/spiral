import { useEffect, useState } from "react";
import { clearApiKey, engineInfo, saveApiKey, saveEngine } from "../lib/ipc";
import type { EngineInfo } from "../lib/types";
import { Field } from "./Field";

const PROVIDERS = [
  { id: "anthropic", name: "Anthropic" },
  { id: "openai", name: "OpenAI" },
  { id: "compatible", name: "Another service" },
];

/** The engine lives here and nowhere else. The main flow never asks and never
 *  sells — it only states, afterwards, what ran. */
export function EngineSettings({ onChanged }: { onChanged: (info: EngineInfo) => void }) {
  const [info, setInfo] = useState<EngineInfo | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    engineInfo()
      .then((next) => {
        setInfo(next);
        onChanged(next);
      })
      .catch((e) => setError(`${e}`));
  }, [onChanged]);

  async function run(work: () => Promise<EngineInfo>, message: string) {
    setError("");
    setSaved("");
    try {
      const next = await work();
      setInfo(next);
      onChanged(next);
      setSaved(message);
    } catch (e) {
      setError(`${e}`);
    }
  }

  if (!info) {
    return <p className="notice">Reading your engine settings…</p>;
  }

  return (
    <>
      <h3 className="panel__heading">Wording engine</h3>
      <p className="panel__lede">
        Spiral Resume works with no key at all — it lays your resume out and tightens the wording
        by rule. Adding your own API key rewrites the phrasing instead. Either way, your names,
        dates and numbers are never changed.
      </p>

      <div className="entry__grid">
        <label className="field">
          <span className="field__label">Service</span>
          <select
            className="field__input"
            value={info.provider}
            onChange={(e) => run(() => saveEngine(e.target.value, "", info.baseUrl), "Saved.")}
          >
            {PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>

        <Field
          label="Model"
          value={info.model}
          onChange={(model) => setInfo({ ...info, model })}
        />
      </div>

      {info.provider === "compatible" ? (
        <Field
          label="Base URL"
          value={info.baseUrl}
          onChange={(baseUrl) => setInfo({ ...info, baseUrl })}
        />
      ) : null}

      <div className="panel__actions">
        <button
          type="button"
          className="btn"
          onClick={() => run(() => saveEngine(info.provider, info.model, info.baseUrl), "Saved.")}
        >
          Save these settings
        </button>
      </div>

      <h3 className="panel__heading">Your API key</h3>
      <p className="panel__lede">
        This is an API key, not your Claude or ChatGPT subscription — they are different things,
        and API usage is billed separately. Your key is stored in this computer's keychain, never
        in a file, and is sent only to {info.host}.
      </p>

      {info.hasKey ? (
        <p className="notice">A key is saved for {PROVIDERS.find((p) => p.id === info.provider)?.name}.</p>
      ) : null}

      <label className="field">
        <span className="field__label">{info.hasKey ? "Replace the key" : "Paste your key"}</span>
        <input
          className="field__input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>

      {saved ? <p className="notice">{saved}</p> : null}
      {error ? <p className="notice notice--warn">{error}</p> : null}

      <div className="panel__actions">
        <button
          type="button"
          className="btn"
          disabled={key.trim().length === 0}
          onClick={() =>
            run(async () => {
              const next = await saveApiKey(key);
              setKey("");
              return next;
            }, "Key saved to your keychain.")
          }
        >
          Save the key
        </button>
        {info.hasKey ? (
          <button
            type="button"
            className="btn"
            onClick={() => run(clearApiKey, "Key removed from your keychain.")}
          >
            Remove the key
          </button>
        ) : null}
      </div>
    </>
  );
}
