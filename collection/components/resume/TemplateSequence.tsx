import Image from "next/image";

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

export default function TemplateSequence() {
  return (
    <section aria-label="The layouts" className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
      <ul className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {SHEETS.map((sheet) => (
          <li key={sheet.id}>
            <Image
              src={`/resume/${sheet.id}.svg`}
              alt={`A resume set in the ${sheet.name} layout`}
              loading="lazy"
              width={612}
              height={792}
              className="w-full bg-paper"
            />
            <p className="type-heading mt-4 text-lg text-paper">{sheet.name}</p>
            <p className="mt-1 text-sm text-gray">{sheet.note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
