import { useEffect, useState } from "react";
import { Stepper, type Step } from "./components/Stepper";
import { loadDocument, saveDocument } from "./lib/ipc";
import {
  emptyDoc,
  type BuildResult,
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
  const [built, setBuilt] = useState<BuildResult | null>(null);

  useEffect(() => {
    loadDocument()
      .then((stored) => {
        if (stored) {
          setDoc(stored.doc);
          setSavedAt(stored.savedAt);
          setTemplate(stored.template);
          setFormat(stored.format === "pdf" || stored.format === "docx" ? stored.format : "");
        }
      })
      .catch(() => setSavedAt(null));
  }, []);

  function goTo(next: Step) {
    setStep(next);
    setReached((seen) => (seen.includes(next) ? seen : [...seen, next]));
  }

  function update(next: ResumeDoc) {
    setDoc(next);
    void saveDocument(next, template, format).catch(() => undefined);
  }

  function chooseTemplate(id: string) {
    setTemplate(id);
    setBuilt(null);
    void saveDocument(doc, id, format).catch(() => undefined);
  }

  function chooseFormat(next: ExportFormat) {
    setFormat(next);
    setBuilt(null);
    void saveDocument(doc, template, next).catch(() => undefined);
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
                <Input
                  onReady={(next) => {
                    update(next);
                    goTo("check");
                  }}
                />
              </>
            ) : null}
            {step === "check" ? (
              <Check doc={doc} onChange={update} onContinue={() => goTo("style")} />
            ) : null}
            {step === "style" ? (
              <Style
                doc={doc}
                chosen={template}
                onChoose={chooseTemplate}
                onContinue={() => goTo("format")}
              />
            ) : null}
            {step === "format" ? (
              <Format chosen={format} onChoose={chooseFormat} onContinue={() => goTo("build")} />
            ) : null}
            {step === "build" && format !== "" ? (
              built ? (
                <Result
                  result={built}
                  format={format}
                  onAnotherStyle={() => {
                    setBuilt(null);
                    goTo("style");
                  }}
                />
              ) : (
                <Build
                  doc={doc}
                  template={template}
                  format={format}
                  onDone={setBuilt}
                  onBack={() => goTo("style")}
                />
              )
            ) : null}
          </main>
        </>
      )}
    </div>
  );
}
