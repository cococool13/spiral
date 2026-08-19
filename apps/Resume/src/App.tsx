import { useCallback, useEffect, useRef, useState } from "react";
import AppBar from "./components/AppBar";
import { Notice } from "./components/Notice";
import { Splash } from "./components/Splash";
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
  const [aim, setAim] = useState("");
  const [saveError, setSaveError] = useState("");
  const [fromScratch, setFromScratch] = useState(false);
  const [ready, setReady] = useState(false);
  const settingsButton = useRef<HTMLButtonElement | null>(null);

  function closeSettings() {
    setSettingsOpen(false);
    settingsButton.current?.focus();
  }

  const settled = useDebounced(draft);

  useEffect(() => {
    const started = Date.now();
    Promise.all([
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
        .catch(() => setSavedAt(null)),
      engineInfo()
        .then((info) => setUsesModel(info.usesModel))
        .catch(() => setUsesModel(false)),
    ]).finally(() => {
      // The mark assembles over ~1.5s. Hold the splash past that so a fast
      // disk does not skip the one moment the load is meant to be.
      // Reduced motion skips the pieces, so it also skips the wait.
      const reduced =
        typeof window.matchMedia !== "function" ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const wait = Math.max(0, (reduced ? 0 : 2800) - (Date.now() - started));
      window.setTimeout(() => setReady(true), wait);
    });
  }, []);

  const edited = useRef(false);

  function edit(changed: Partial<Draft>) {
    edited.current = true;
    setDraft((current) => ({ ...current, ...changed }));
  }

  useEffect(() => {
    if (!edited.current) return;
    void saveDocument(settled)
      .then(() => setSaveError(""))
      .catch((e) => setSaveError(`${e}`));
  }, [settled]);

  const onInputReady = useCallback((doc: ResumeDoc, how?: "scratch") => {
    edited.current = true;
    setFromScratch(how === "scratch");
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

  function choose(changed: Partial<Draft>) {
    edit(changed);
    setVersions([]);
    setAim("");
  }

  if (!ready) return <Splash />;

  return (
    <div className="app">
      <AppBar
        app="Resume"
        menuRef={settingsButton}
        current={settingsOpen ? "settings" : undefined}
        items={[
          {
            id: "settings",
            label: settingsOpen ? "Close settings" : "Settings",
            onSelect: () => setSettingsOpen((open) => !open),
          },
        ]}
      />

      {settingsOpen ? (
        <main className="app__main">
          <Settings
            onClose={closeSettings}
            onEngineChanged={(info) => setUsesModel(info.usesModel)}
            onCleared={() => {
              edit({ doc: emptyDoc() });
              setSavedAt(null);
              setFromScratch(false);
              setStep("input");
              setReached(["input"]);
              closeSettings();
            }}
          />
        </main>
      ) : (
        <>
          <Stepper current={step} reached={reached} onJump={goTo} />
          <main
            className={
              step === "input" ||
              (step === "build" && (draft.format === "" || (versions.length > 0 && rebuilding === 0)))
                ? "app__main app__main--stage"
                : "app__main"
            }
          >
            {saveError ? <Notice tone="warn">{saveError}</Notice> : null}
            {step === "input" ? (
              <Input
                onReady={onInputReady}
                savedAt={savedAt}
                onOpenSaved={() => {
                  setFromScratch(false);
                  goTo("check");
                }}
              />
            ) : null}
            {step === "check" ? (
              <Check
                doc={draft.doc}
                tighten={draft.tighten}
                fromScratch={fromScratch}
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
                onContinue={() => goTo("build")}
              />
            ) : null}
            {step === "build" ? (
              !draft.format ? (
                <Format chosen="" onChoose={(format) => choose({ format })} />
              ) : versions.length > 0 && rebuilding === 0 ? (
                <Result
                  versions={versions}
                  showing={showing}
                  format={draft.format}
                  canRewrite={usesModel}
                  onShow={setShowing}
                  onTweak={(next) => {
                    setAim(next);
                    setRebuilding((n) => n + 1);
                  }}
                  onAnotherStyle={() => {
                    setVersions([]);
                    setShowing(0);
                    setAim("");
                    goTo("style");
                  }}
                />
              ) : (
                <Build
                  key={`${versions.length}-${rebuilding}-${aim}`}
                  draft={draft}
                  aim={aim}
                  onDone={(result) => {
                    setVersions((all) => [...all, result]);
                    setShowing(versions.length);
                    setRebuilding(0);
                    setAim("");
                  }}
                  onBack={() => {
                    setRebuilding(0);
                    setAim("");
                    choose({ format: "" });
                    goTo("build");
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
