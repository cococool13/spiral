import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { cacheSrc } from "../api";
import { compareFacts, type FactState } from "../lib/facts";
import { plainText } from "../lib/plain";
import type { ResumeDoc } from "../lib/types";

type View = "page" | "facts" | "plain";

const VIEWS: { id: View; label: string }[] = [
  { id: "page", label: "Page" },
  { id: "facts", label: "Facts locked" },
  { id: "plain", label: "Plain text" },
];

const STATE_WORD: Record<FactState, string> = {
  unchanged: "Unchanged",
  edited: "Edited by you",
  added: "Added by you",
  removed: "Removed by you",
};

interface PagePaneProps {
  doc: ResumeDoc;
  original: ResumeDoc | null;
  pages: string[];
  onPaint: () => void;
  action: ReactNode;
}

/** Right half of the editor: the live typeset page, the facts beside the
 *  original, and the text an applicant tracking system would read. */
export function PagePane({ doc, original, pages, onPaint, action }: PagePaneProps) {
  const [view, setView] = useState<View>("page");
  const rows = useMemo(() => compareFacts(original ?? doc, doc), [doc, original]);
  const kept = rows.filter((row) => row.state === "unchanged").length;
  const text = useMemo(() => (view === "plain" ? plainText(doc) : ""), [doc, view]);

  function onTabKey(event: KeyboardEvent, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = VIEWS[(index + (event.key === "ArrowRight" ? 1 : -1) + VIEWS.length) % VIEWS.length];
    setView(next.id);
    document.getElementById(`view-${next.id}`)?.focus();
  }

  return (
    <section className="pane" aria-label="Typeset page">
      <div className="pane__bar">
        <div className="pane__tabs" role="tablist" aria-label="View">
          {VIEWS.map((item, index) => (
            <button
              key={item.id}
              id={`view-${item.id}`}
              type="button"
              role="tab"
              className="pane__tab"
              aria-selected={view === item.id}
              aria-controls={`panel-${item.id}`}
              tabIndex={view === item.id ? 0 : -1}
              onClick={() => setView(item.id)}
              onKeyDown={(event) => onTabKey(event, index)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {action}
      </div>

      <div className="pane__body" id={`panel-${view}`} role="tabpanel" aria-labelledby={`view-${view}`}>
        {view === "page" ? (
          <div className="sheet">
            {pages.length === 0 ? <p className="pane__quiet">Typesetting the page.</p> : null}
            {pages.map((page, index) => (
              <img
                key={page}
                className="sheet__page"
                src={cacheSrc(page)}
                alt={index === 0 ? `Page 1 of ${pages.length}, typeset from the fields on the left` : `Page ${index + 1}`}
                onLoad={onPaint}
              />
            ))}
          </div>
        ) : null}

        {view === "facts" ? (
          <div className="facts">
            <p className="facts__head">
              <strong>
                {kept} of {rows.length} facts unchanged.
              </strong>{" "}
              Spiral never rewrites a fact. Only you can, in the fields on the left.
            </p>
            <table className="facts__table">
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col">Original</th>
                  <th scope="col">On the page</th>
                  <th scope="col">
                    <span className="visually-hidden">State</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} data-state={row.state}>
                    <th scope="row">{row.label}</th>
                    <td>{row.original}</td>
                    <td>{row.current}</td>
                    <td className="facts__state">{STATE_WORD[row.state]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {view === "plain" ? (
          <pre className="plain" aria-label="Plain text">
            {text}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
