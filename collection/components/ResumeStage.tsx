"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Icon from "./Icons";

/** A clearly fictional sample. Left: what the person wrote. Right: Spiral's page. */
const ROWS: { src: string; out: ReactNode }[] = [
  { src: "Mara Okafor", out: <b>Mara Okafor</b> },
  { src: "Product Designer", out: "Product Designer" },
  {
    src: "mara.sample@example.com | Lisbon, PT",
    out: "mara.sample@example.com, Lisbon, PT",
  },
  {
    src: "Lumen Health - Senior Product Designer 2021-2024",
    out: (
      <>
        <b>Lumen Health</b>, Senior Product Designer, 2021 to 2024
      </>
    ),
  },
  {
    src: "Rebuilt onboarding; activation rose from 31% to 49%.",
    out: "Rebuilt onboarding; activation rose from 31% to 49%.",
  },
  {
    src: "Fieldwork Studio - Designer 2018-2021",
    out: (
      <>
        <b>Fieldwork Studio</b>, Designer, 2018 to 2021
      </>
    ),
  },
  {
    src: "Shipped a booking flow used by 12,000 guests a month.",
    out: "Shipped a booking flow used by 12,000 guests a month.",
  },
  {
    src: "Skills: Figma, Framer, SQL, user research",
    out: "Figma, Framer, SQL, user research",
  },
];

const PLAIN = `MARA OKAFOR
Product Designer
mara.sample@example.com, Lisbon, PT

EXPERIENCE
Lumen Health, Senior Product Designer, 2021-2024
  Rebuilt onboarding; activation rose from 31% to 49%.
Fieldwork Studio, Designer, 2018-2021
  Shipped a booking flow used by 12,000 guests a month.

SKILLS
Figma, Framer, SQL, user research`;

const TEMPLATES = ["Sans", "Serif", "Compact"] as const;

export default function ResumeStage() {
  const [view, setView] = useState<"facts" | "plain">("facts");
  const [tpl, setTpl] = useState<(typeof TEMPLATES)[number]>("Sans");
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function typeset() {
    if (phase === "running") return;
    setPhase("running");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timer.current = window.setTimeout(() => setPhase("done"), reduced ? 0 : 1700);
  }

  return (
    <div className="panel-grid">
      <div>
        <button
          type="button"
          className={phase === "running" ? "drop is-running" : "drop"}
          onClick={typeset}
        >
          <span className="drop-dome" aria-hidden="true">
            <Icon name="plus" />
          </span>
          <span aria-live="polite">
            <b className="drop-title">
              {phase === "running"
                ? "Typesetting…"
                : phase === "done"
                  ? "Typeset. Drop another"
                  : "Drop a resume"}
            </b>
            <small className="drop-sub">
              PDF, DOCX or pasted text. This sample is Mara Okafor, who is not real.
            </small>
          </span>
          <span className="drop-prog" aria-hidden="true">
            <i className="drop-bar" />
          </span>
        </button>

        <div className={`doc tpl-${tpl.toLowerCase()}`}>
          <div className="doc-bar">
            {(["facts", "plain"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className="chip"
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v === "facts" ? "Facts locked" : "Plain text"}
              </button>
            ))}
            <span className="doc-name">mara-okafor.pdf</span>
          </div>
          {view === "facts" ? (
            <div className={phase === "running" ? "diff is-dim" : "diff"}>
              <span className="diff-hd">Your original</span>
              <span className="diff-hd c">Check</span>
              <span className="diff-hd">Spiral’s page</span>
              {ROWS.map((r, i) => (
                <div key={r.src} style={{ display: "contents" }}>
                  <span className="cell-l">{r.src}</span>
                  <span className="cell-m">
                    <span className="ok">
                      <Icon name="check" />
                      <span>unchanged</span>
                    </span>
                  </span>
                  <span
                    className={`cell-r${i === 0 ? " first" : ""}${i === ROWS.length - 1 ? " last" : ""}`}
                  >
                    <span>{r.out}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <pre className="plain">{PLAIN}</pre>
          )}
        </div>

        <fieldset className="ctl" aria-label="Template" style={{ marginTop: 18 }}>
          <span className="lab" aria-hidden="true">
            Template
          </span>
          <span className="ctl-group">
            {TEMPLATES.map((t) => (
              <button
                key={t}
                type="button"
                className="chip"
                aria-pressed={tpl === t}
                onClick={() => setTpl(t)}
              >
                {t}
              </button>
            ))}
          </span>
        </fieldset>
      </div>

      <ul className="ledger">
        <li>A resume goes in. A typeset PDF or Word file comes out.</li>
        <li>
          No fact may change. Names, dates, employers and numbers are checked after every
          rewrite, and a rewrite that moves one is thrown away.
        </li>
        <li>The first pass never opens a connection.</li>
        <li>A model runs only if you add your own key or download one to disk.</li>
      </ul>
    </div>
  );
}
