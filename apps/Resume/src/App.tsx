import { useCallback, useEffect, useState } from "react";
import { Stepper, type Step } from "./components/Stepper";
import { engineInfo, loadDocument, saveDocument } from "./lib/ipc";
import {
  emptyDoc,
  type BuildResult,
  type Draft,
  type ExportFormat,
  type ResumeDoc,
} from "./lib/types";
import { Build } from "./screens/Build";
import { Check } from "./screens/Check";
import { Format } from "./screens/Format";
import { Input } from "./screens/Input";
import { Result } from "./screens/Result";
import { Settings } from "./screens/Settings";
import { Style } from "./screens/Style";

export default function App() {
  const [doc, setDoc] = useState<ResumeDoc>(emptyDoc());
  const [step, setStep] = useState<Step>("input");
  const [reached, setReached] = useState<Step[]>(["input"]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [template, setTemplate] = useState("");
  const [format, setFormat] = useState<ExportFormat | "">("");
  const [versions, setVersions] = useState<BuildResult[]>([]);
  const [showing, setShowing] = useState(0);
  const [usesModel, setUsesModel] = useState(false);
  const [rebuilding, setRebuilding] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [accent, setAccent] = useState("ink");
  const [tighten, setTighten] = useState(true);

  useEffect(() => {
    loadDocument()
      .then((stored) => {
        if (stored) {
          setDoc(stored.doc);
          setSavedAt(stored.savedAt);
          setTemplate(stored.template);
          setFormat(stored.format === "pdf" || stored.format === "docx" ? stored.format : "");
          if (stored.accent) setAccent(stored.accent);
          setTighten(stored.tighten);
        }
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

  const draft: Draft = { doc, template, format, accent, tighten };

  // Stable identity: an inline arrow here re-ran Input's drag-drop effect on
  // every render of this component, stacking listeners.
  const onInputReady = useCallback(
    (next: ResumeDoc) => {
      setDoc(next);
      persist({ doc: next });
      setStep("check");
      setReached((seen) => (seen.includes("check") ? seen : [...seen, "check"]));
    },
    // `persist` closes over the current draft, so the whole draft is the dep.
    [doc, template, format, accent, tighten],
  );

  function goTo(next: Step) {
    setStep(next);
    setReached((seen) => (seen.includes(next) ? seen : [...seen, next]));
  }

  // Persistence failures used to be swallowed, so an unwritable folder meant
  // the user kept working on a document that was never being saved.
  //
  // Takes the one field that changed: React state has not caught up when this
  // runs, so passing the whole draft from a setter would save the old value.
  function persist(changed: Partial<Draft>) {
    void saveDocument({ ...draft, ...changed })
      .then(() => setSaveError(""))
      .catch((e) => setSaveError(`${e}`));
  }

  function update(next: ResumeDoc) {
    setDoc(next);
    persist({ doc: next });
  }

  /** Every style choice invalidates the built versions: they were set in the
   *  previous one. */
  function choose(changed: Partial<Draft>) {
    setVersions([]);
    persist(changed);
  }

  function chooseTemplate(id: string) {
    setTemplate(id);
    choose({ template: id });
  }

  function chooseTighten(next: boolean) {
    setTighten(next);
    choose({ tighten: next });
  }

  function chooseAccent(next: string) {
    setAccent(next);
    choose({ accent: next });
  }

  function chooseFormat(next: ExportFormat) {
    setFormat(next);
    choose({ format: next });
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
              setDoc(emptyDoc());
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
                doc={doc}
                tighten={tighten}
                onChange={update}
                onTighten={chooseTighten}
                onContinue={() => goTo("style")}
              />
            ) : null}
            {step === "style" ? (
              <Style
                doc={doc}
                chosen={template}
                accent={accent}
                onChoose={chooseTemplate}
                onChooseAccent={chooseAccent}
                onContinue={() => goTo("format")}
              />
            ) : null}
            {step === "format" ? (
              <Format chosen={format} onChoose={chooseFormat} onContinue={() => goTo("build")} />
            ) : null}
            {step === "build" && format !== "" ? (
              versions.length > 0 && rebuilding === 0 ? (
                <Result
                  versions={versions}
                  showing={showing}
                  format={format}
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
                  draft={{ ...draft, format }}
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
