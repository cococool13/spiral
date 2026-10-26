import { useCallback, useEffect, useRef, useState } from "react";
import { engineInfo } from "../api";
import { ExportButton, ExportSheet, useExport } from "../components/Export";
import { Flags } from "../components/Flags";
import { PagePane } from "../components/PagePane";
import { SetupCard } from "../components/SetupCard";
import { Templates } from "../components/Templates";
import { useResume } from "../session";
import { Details } from "./Details";

/** One two-pane editor: the facts on the left, the typeset page on the right,
 *  your resume in every template along the bottom. */
export function Editor() {
  const session = useResume();
  const { draft, edit } = session;
  const exporter = useExport(draft);
  const [templates, setTemplates] = useState<string[]>([]);
  const keys = useRef({ templates, exporter, edit });
  keys.current = { templates, exporter, edit };
  const onList = useCallback((ids: string[]) => setTemplates(ids), []);

  // Captured before the shell sees it, so ⌘1 to ⌘9 pick a template here
  // instead of switching tools.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!event.metaKey || event.shiftKey || event.altKey || event.ctrlKey) return;
      if (event.key === "e") {
        event.preventDefault();
        void keys.current.exporter.run();
        return;
      }
      const n = Number(event.key);
      const id = Number.isInteger(n) && n >= 1 ? keys.current.templates[n - 1] : undefined;
      if (!id) return;
      event.preventDefault();
      keys.current.edit({ template: id });
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div className="editor">
      <Flags doc={draft.doc} text={session.source} />
      <div className="editor__panes">
        <div className="editor__fields">
          <Details
            doc={draft.doc}
            tighten={draft.tighten}
            fromScratch={session.fromScratch}
            original={session.baseline ?? undefined}
            onChange={(doc) => edit({ doc })}
            onTighten={(tighten) => {
              edit({ tighten });
              if (!tighten) return;
              // Tightening needs a choice of engine first; ask only if none was made.
              void engineInfo()
                .then((info) => {
                  if (info.needsSetup) session.openSetup();
                })
                .catch(() => undefined);
            }}
          />
          <SetupCard ready={session.pages.length > 0} onSetUp={session.openSetup} />
        </div>
        <div className="editor__page">
          <PagePane
            doc={draft.doc}
            original={session.baseline}
            pages={session.pages}
            onPaint={session.painted}
            action={<ExportButton busy={exporter.phase.kind === "working"} onClick={() => void exporter.run()} />}
          />
          <ExportSheet phase={exporter.phase} onClose={exporter.dismiss} />
        </div>
      </div>
      <Templates
        doc={draft.doc}
        chosen={draft.template}
        accent={draft.accent}
        onChoose={(template) => edit({ template })}
        onAccent={(accent) => edit({ accent })}
        onList={onList}
      />
    </div>
  );
}
