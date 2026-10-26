import { useEffect, useRef } from "react";
import { Dome as DomeButton } from "../../ui/Glass";
import { PillCloseGlyph, PillPlusGlyph } from "../../ui/glyphs";
import { Notice } from "../../ui/Notice";
import type { ModuleProps } from "../types";
import { Editor } from "./screens/Editor";
import { Input } from "./screens/Input";
import { Setup } from "./screens/Setup";
import { Frame, useResume } from "./session";
import "./resume.css";

export { Frame };

/** Resume adds no icons to the pill; its tools live in the editor. */
export function Tools() {
  return null;
}

export function Dome() {
  const session = useResume();
  return (
    <DomeButton label="Open a resume" keys="Meta+O" disabled={session.opening} onClick={session.openFile}>
      <PillPlusGlyph />
    </DomeButton>
  );
}

export default function ModuleRoot({ setStatus }: ModuleProps) {
  const session = useResume();
  const openRef = useRef(session.openFile);
  openRef.current = session.openFile;

  useEffect(() => {
    setStatus("Resume. Reading and typesetting happen on this Mac. No connection used.");
  }, [setStatus]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!event.metaKey || event.shiftKey || event.altKey || event.ctrlKey || event.key !== "o") return;
      event.preventDefault();
      openRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="resume" data-stage={session.stage}>
      <h1 className="visually-hidden">Resume</h1>
      {session.saveError ? <Notice tone="error">{session.saveError}</Notice> : null}
      {session.stage === "empty" ? (
        <Input
          onReady={session.ready}
          savedAt={session.savedAt}
          onOpenSaved={session.openSaved}
          opening={session.opening}
          openError={session.openError}
        />
      ) : (
        <Editor />
      )}
      {session.setup ? <SetupSheet onClose={session.closeSetup} /> : null}
    </main>
  );
}

function SetupSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="setup-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="A model for tightening"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="setup-sheet__body">
        <button type="button" className="setup-sheet__close" aria-label="Close" onClick={onClose}>
          <PillCloseGlyph />
        </button>
        <Setup onDone={onClose} />
      </div>
    </div>
  );
}
