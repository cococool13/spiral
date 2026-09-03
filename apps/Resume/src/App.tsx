import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import AppBar from "./components/AppBar";
import { Notice } from "./components/Notice";
import { Splash } from "./components/Splash";
import { Stepper, type Step } from "./components/Stepper";
import { engineInfo, loadDocument, saveDocument } from "./lib/ipc";
import { emptyDoc, type BuiltVersion, type Draft, type ResumeDoc } from "./lib/types";
import { Activate } from "./screens/Activate";
import { Build } from "./screens/Build";
import { Check } from "./screens/Check";
import { Format } from "./screens/Format";
import { Input } from "./screens/Input";
import { Result } from "./screens/Result";
import { Settings } from "./screens/Settings";
import { Setup } from "./screens/Setup";
import { useDebounced } from "./lib/useDebounced";
import { styleName } from "./lib/styleHints";
import { withViewTransition } from "./lib/viewTransition";
import { Style } from "./screens/Style";

type LicenseBoot = "loading" | "locked" | "ok";

export default function App() {
  const [draft, setDraft] = useState<Draft>({
    doc: emptyDoc(),
    template: "",
    format: "",
    accent: "ink",
    tighten: false,
  });
  const [step, setStep] = useState<Step>("input");
  const [reached, setReached] = useState<Step[]>(["input"]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [versions, setVersions] = useState<BuiltVersion[]>([]);
  const [showing, setShowing] = useState(0);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [generate, setGenerate] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [fromScratch, setFromScratch] = useState(false);
  const [splash, setSplash] = useState<"in" | "out" | "off">("in");
  const [license, setLicense] = useState<LicenseBoot>("loading");
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const settingsButton = useRef<HTMLButtonElement | null>(null);

  function closeSettings() {
    withViewTransition(() => setSettingsOpen(false));
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
        .then((info) => {
          setNeedsSetup(info.needsSetup);
        })
        .catch(() => undefined),
      invoke("license_ensure")
        .then(() => setLicense("ok"))
        .catch((e) => {
          setLicenseError(typeof e === "string" ? e : null);
          setLicense("locked");
        }),
    ]).finally(() => {
      const reduced =
        typeof window.matchMedia !== "function" ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const wait = Math.max(0, (reduced ? 0 : 200) - (Date.now() - started));
      window.setTimeout(() => {
        setSplash("out");
        window.setTimeout(() => setSplash("off"), reduced ? 0 : 280);
      }, wait);
    });
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeSettings();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

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
    withViewTransition(() => {
      setFromScratch(how === "scratch");
      setDraft((current) => ({ ...current, doc }));
      setStep("check");
      setReached((seen) => (seen.includes("check") ? seen : [...seen, "check"]));
    });
  }, []);

  function goTo(next: Step) {
    withViewTransition(() => {
      setStep(next);
      setReached((seen) => (seen.includes(next) ? seen : [...seen, next]));
    });
  }

  function update(doc: ResumeDoc) {
    edit({ doc });
  }

  function choose(changed: Partial<Draft>) {
    edit(changed);
    setVersions([]);
    setGenerate(false);
  }

  if (splash !== "off") return <Splash leaving={splash === "out"} />;

  if (license === "loading") return <main className="app__main" aria-busy="true" />;

  if (license === "locked") {
    return (
      <div className="app">
        <main className="app__main app__main--stage">
          <Activate
            onDone={() => {
              setLicenseError(null);
              setLicense("ok");
            }}
          />
          {licenseError ? <Notice tone="warn">{licenseError}</Notice> : null}
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <AppBar
        app="Resume"
        menuRef={settingsButton}
        current={settingsOpen ? "settings" : undefined}
        items={[
          {
            id: "settings",
            label: "Settings",
            onSelect: () => withViewTransition(() => setSettingsOpen((open) => !open)),
          },
        ]}
      />

      {settingsOpen ? (
        <main className="app__main">
          <Settings
            onClose={closeSettings}
            onEngineChanged={(info) => {
              setNeedsSetup(info.needsSetup);
            }}
            onCleared={() => {
              withViewTransition(() => {
                edit({ doc: emptyDoc() });
                setSavedAt(null);
                setFromScratch(false);
                setStep("input");
                setReached(["input"]);
                setSettingsOpen(false);
              });
              settingsButton.current?.focus();
            }}
          />
        </main>
      ) : needsSetup ? (
        <main className="app__main app__main--stage">
          <Setup
            onDone={() => {
              setNeedsSetup(false);
            }}
          />
        </main>
      ) : (
        <>
          <Stepper current={step} reached={reached} onJump={goTo} />
          <main
            className={
              step === "input" ||
              (step === "build" && (!generate || versions.length > 0))
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
              !generate || !draft.format ? (
                <Format
                  chosen={draft.format}
                  onChoose={(format) => choose({ format })}
                  onGenerate={() => withViewTransition(() => setGenerate(true))}
                />
              ) : versions.length > 0 ? (
                <Result
                  versions={versions}
                  showing={showing}
                  format={draft.format === "docx" ? "docx" : "pdf"}
                  onShow={setShowing}
                  onAnotherStyle={() => {
                    withViewTransition(() => {
                      setVersions([]);
                      setShowing(0);
                      setGenerate(false);
                      setStep("style");
                      setReached((seen) => (seen.includes("style") ? seen : [...seen, "style"]));
                    });
                  }}
                />
              ) : (
                <Build
                  key={String(versions.length)}
                  draft={draft}
                  onDone={(result) => {
                    withViewTransition(() => {
                      setVersions((all) => [
                        ...all,
                        { ...result, style: styleName(draft.template) },
                      ]);
                      setShowing(versions.length);
                    });
                  }}
                  onBack={() => withViewTransition(() => choose({ format: "" }))}
                />
              )
            ) : null}
          </main>
        </>
      )}
    </div>
  );
}
