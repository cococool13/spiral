import { useCallback, useEffect, useRef, useState } from "react";
import { Stepper, type Step } from "./components/Stepper";
import { engineInfo, loadDocument, saveDocument } from "./lib/ipc";
import { emptyDoc, type BuildResult, type Draft, type ResumeDoc } from "./lib/types";
import { Build } from "./screens/Build";
import { Check } from "./screens/Check";
import { Format } from "./screens/Format";
import { Input } from "./screens/Input";
import { Result } from "./screens/Result";
import { Settings } from "./screens/Settings";
import { useDebounced } from "./lib/useDebounced";
import { Style } from "./screens/Style";

export default function App() {
  const [draft, setDraft] = useState<Draft>({
    doc: emptyDoc(),
    template: "",
    format: "",
    accent: "ink",
    tighten: true,
  });
  const [step, setStep] = useState<Step>("input");
  const [reached, setReached] = useState<Step[]>(["input"]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [versions, setVersions] = useState<BuildResult[]>([]);
  const [showing, setShowing] = useState(0);
  const [usesModel, setUsesModel] = useState(false);
  const [rebuilding, setRebuilding] = useState(0);
  const [saveError, setSaveError] = useState("");

  // The saved copy waits for typing to stop; `save_document` is synchronous
  // and writes the whole document.
  const settled = useDebounced(draft);

  useEffect(() => {
    loadDocument()
      .then((stored) => {
        if (!stored) return;
        setSavedAt(stored.savedAt);
        setDraft({
          doc: stored.doc,
          template: stored.template,
          format: stored.format === "pdf" || stored.format === "docx" ? stored.format : "",
          accent: stored.accent || "ink",
          tighten: stored.tighten,
        });
      })
      .catch(() => setSavedAt(null));
  }, []);

  // Asked on launch, not only when Settings is opened. Without this, someone
  // who saved a key last week reopened the app and found "another version"
  // missing until they wandered back into Settings.
  useEffect(() => {
    engineInfo()
      .then((info) => setUsesModel(info.usesModel))
      .catch(() => setUsesModel(false));
  }, []);

  // Only a document the user has actually touched is written back, so opening
  // the app and changing nothing leaves "saved from…" where it was.
  const edited = useRef(false);

  function edit(changed: Partial<Draft>) {
    edited.current = true;
    setDraft((current) => ({ ...current, ...changed }));
  }

  // A failure here is surfaced, not swallowed: an unwritable folder must not
  // let someone keep working on a document that is not being saved.
  useEffect(() => {
    if (!edited.current) return;
    void saveDocument(settled)
      .then(() => setSaveError(""))
      .catch((e) => setSaveError(`${e}`));
  }, [settled]);

  // Stable identity: an inline arrow here re-ran Input's drag-drop effect on
  // every render of this component, stacking listeners.
  const onInputReady = useCallback((doc: ResumeDoc) => {
    edited.current = true;
    setDraft((current) => ({ ...current, doc }));
    setStep("check");
    setReached((seen) => (seen.includes("check") ? seen : [...seen, "check"]));
  }, []);

  function goTo(next: Step) {
    setStep(next);
    setReached((seen) => (seen.includes(next) ? seen : [...seen, next]));
  }

  function update(doc: ResumeDoc) {
    edit({ doc });
  }

  /** Every style choice invalidates the built versions: they were set in the
   *  previous one. */
  function choose(changed: Partial<Draft>) {
    edit(changed);
    setVersions([]);
  }

  return (
    <div className="app">
      <header className="app__bar">
        <span className="app__mark" aria-hidden="true" />
        <h1 className="app__title">Spiral Resume</h1>
        <span className="app__spacer" />
        <button type="button" className="btn" onClick={() => setSettingsOpen((open) => !open)}>
          Settings
        </button>
      </header>

      {settingsOpen ? (
        <main className="app__main">
          <Settings
            onClose={() => setSettingsOpen(false)}
            onEngineChanged={(info) => setUsesModel(info.usesModel)}
            onCleared={() => {
              edit({ doc: emptyDoc() });
              setSavedAt(null);
              setStep("input");
              setReached(["input"]);
              setSettingsOpen(false);
            }}
          />
        </main>
      ) : (
        <>
          <Stepper current={step} reached={reached} onJump={goTo} />
          <main className="app__main">
            {saveError ? <p className="notice notice--warn">{saveError}</p> : null}
            {step === "input" ? (
              <>
                {savedAt ? (
                  <p className="notice">
                    You have a resume saved from {new Date(savedAt).toLocaleString()}.{" "}
                    <button type="button" className="btn" onClick={() => goTo("check")}>
                      Continue where you left off
                    </button>
                  </p>
                ) : null}
                <Input onReady={onInputReady} />
              </>
            ) : null}
            {step === "check" ? (
              <Check
                doc={draft.doc}
                tighten={draft.tighten}
                onChange={update}
                onTighten={(tighten) => choose({ tighten })}
                onContinue={() => goTo("style")}
              />
            ) : null}
            {step === "style" ? (
              <Style
                doc={draft.doc}
                chosen={draft.template}
                accent={draft.accent}
                onChoose={(template) => choose({ template })}
                onChooseAccent={(accent) => choose({ accent })}
                onContinue={() => goTo("format")}
              />
            ) : null}
            {step === "format" ? (
              <Format chosen={draft.format} onChoose={(format) => choose({ format })} onContinue={() => goTo("build")} />
            ) : null}
            {step === "build" && draft.format !== "" ? (
              versions.length > 0 && rebuilding === 0 ? (
                <Result
                  versions={versions}
                  showing={showing}
                  format={draft.format}
                  canRewrite={usesModel}
                  onShow={setShowing}
                  onRewrite={() => setRebuilding((n) => n + 1)}
                  onAnotherStyle={() => {
                    setVersions([]);
                    setShowing(0);
                    goTo("style");
                  }}
                />
              ) : (
                <Build
                  // A fresh key remounts the screen, which is what makes
                  // "rewrite the wording again" actually run a second build.
                  key={`${versions.length}-${rebuilding}`}
                  draft={draft}
                  onDone={(result) => {
                    setVersions((all) => [...all, result]);
                    setShowing(versions.length);
                    setRebuilding(0);
                  }}
                  onBack={() => {
                    setRebuilding(0);
                    goTo("style");
                  }}
                />
              )
            ) : null}
          </main>
        </>
      )}
    </div>
  );
}
