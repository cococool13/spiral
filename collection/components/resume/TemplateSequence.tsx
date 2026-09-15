"use client";

import Image from "next/image";
import { useState } from "react";

/** Every sheet is a real render from the app: the same Typst engine that writes
 *  the PDF, run over one sample resume. Nothing here is a mockup, which is the
 *  only honest way to show a page whose product *is* typesetting. */
const SHEETS = [
  { id: "column", name: "Column", note: "Two columns. Skills sit beside the work." },
  { id: "ledger", name: "Ledger", note: "A large name, then quiet rules." },
  { id: "sheet", name: "Sheet", note: "Single column. Nothing shouts." },
  { id: "rule", name: "Rule", note: "A hairline under every heading." },
  { id: "card", name: "Card", note: "The name in a block at the top." },
  { id: "bullet", name: "Bullet", note: "Education first, name centred." },
  { id: "brief", name: "Brief", note: "A labelled summary up top." },
  { id: "chronicle", name: "Chronicle", note: "School and activities first." },
  { id: "index", name: "Index", note: "Skills under education, then roles." },
  { id: "timeline", name: "Timeline", note: "The jobs are the document." },
  { id: "blend", name: "Blend", note: "Skills and wins above the jobs." },
  { id: "lead", name: "Lead", note: "Name between rules. Outcomes, not duties." },
] as const;

const FEATURED = 4;

export default function TemplateSequence() {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? SHEETS : SHEETS.slice(0, FEATURED);

  return (
    <section aria-label="The layouts" className="template-gallery">
      <div className="shell">
        <div className="section-heading">
          <p className="eyeline">The layouts / actual output</p>
          <h2>
            A different setting.
            <br />
            The same story.
          </h2>
          <p>
            One sample resume.
            <br />
            Twelve ways to set it.
          </p>
        </div>
        <ul className="template-grid">
          {visible.map((sheet) => (
            <li key={sheet.id}>
              <Image
                src={`/resume/${sheet.id}.svg`}
                alt={`A resume set in the ${sheet.name} layout`}
                loading="lazy"
                width={612}
                height={792}
                className="w-full bg-paper"
              />
              <p className="template-name">{sheet.name}</p>
              <p className="template-note">{sheet.note}</p>
            </li>
          ))}
        </ul>
        {showAll ? null : (
          <div className="mt-10">
            <button
              type="button"
              className="template-expand"
              onClick={() => setShowAll(true)}
            >
              All {SHEETS.length} layouts
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
