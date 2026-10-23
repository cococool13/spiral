import { useEffect } from "react";
import { Button } from "../../ui/Button";
import { Plate } from "../../ui/Plate";
import { Notice } from "../../ui/Notice";
import type { ModuleProps } from "../types";
import { Stepper } from "./components/Stepper";
import { Build } from "./screens/Build";
import { Check } from "./screens/Check";
import { Details } from "./screens/Details";
import { Format } from "./screens/Format";
import { Input } from "./screens/Input";
import { Result } from "./screens/Result";
import { Setup } from "./screens/Setup";
import { Style } from "./screens/Style";
import { Frame, Preview, useResume } from "./session";
import "./resume.css";

export { Frame };

export function Toolbar() {
  const session = useResume();
  return (
    <div className="resume-toolbar">
      <Stepper current={session.step} reached={session.reached} onJump={session.go} />
      <Button onClick={session.openSetup}>Wording</Button>
    </div>
  );
}

export default function ModuleRoot({ setStatus }: ModuleProps) {
  const session = useResume();

  useEffect(() => {
    setStatus(session.generate ? "Building the resume" : "No connection used");
  }, [session.generate, setStatus]);

  return (
    <main className={session.step === "import" ? "resume resume--solo" : "resume"}>
      <h1 className="visually-hidden">Resume</h1>
      <div className="resume__work">
        {session.saveError ? <Notice tone="error">{session.saveError}</Notice> : null}
        {session.setup ? (
          <Setup onDone={session.closeSetup} />
        ) : (
          <StepBody />
        )}
      </div>
      {session.step === "import" ? null : (
        <Plate marked>
          <Preview pages={session.pages} line={session.line} onPaint={session.painted} />
        </Plate>
      )}
    </main>
  );
}

function StepBody() {
  const session = useResume();
  if (session.step === "import") {
    return <Input onReady={session.ready} savedAt={session.savedAt} onOpenSaved={session.openSaved} />;
  }
  if (session.step === "details") {
    return (
      <Details
        doc={session.draft.doc}
        tighten={session.draft.tighten}
        fromScratch={session.fromScratch}
        original={session.baseline ?? undefined}
        onChange={(doc) => session.edit({ doc })}
        onTighten={(tighten) => session.edit({ tighten })}
        onContinue={() => session.go("style")}
      />
    );
  }
  if (session.step === "style") {
    return (
      <Style
        doc={session.draft.doc}
        chosen={session.draft.template}
        accent={session.draft.accent}
        onChoose={(template) => session.edit({ template })}
        onChooseAccent={(accent) => session.edit({ accent })}
        onContinue={() => session.go("build")}
      />
    );
  }
  if (session.step === "build") {
    if (!session.generate || !session.draft.format) {
      return (
        <Format
          chosen={session.draft.format}
          onChoose={(format) => session.edit({ format })}
          onGenerate={session.startBuild}
        />
      );
    }
    return <Build draft={session.draft} onDone={session.built} onBack={session.backToFormat} />;
  }
  if (session.step === "check") {
    return <Check doc={session.draft.doc} text={session.source} onContinue={() => session.go("export")} />;
  }
  if (session.versions.length === 0) {
    return (
      <section className="panel">
        <h2 className="panel__title">Export</h2>
        <p className="panel__lede">Build the resume first.</p>
      </section>
    );
  }
  return (
    <Result
      versions={session.versions}
      format={session.draft.format === "docx" ? "docx" : "pdf"}
      onAnotherStyle={session.anotherStyle}
    />
  );
}
