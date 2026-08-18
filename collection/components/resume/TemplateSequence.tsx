import Image from "next/image";

/** Every sheet is a real render from the app: the same Typst engine that writes
 *  the PDF, run over one sample resume. Nothing here is a mockup, which is the
 *  only honest way to show a page whose product *is* typesetting. */
const SHEETS = [
  { id: "column", name: "Column", note: "Centred, serif, quiet." },
  { id: "blend", name: "Blend", note: "Sans, wide tracking, room to breathe." },
  { id: "ledger", name: "Ledger", note: "Dates in a left rail." },
  { id: "card", name: "Card", note: "A shaded block behind the name." },
  { id: "rule", name: "Rule", note: "A hairline under every section." },
  { id: "timeline", name: "Timeline", note: "Roles read as a run of years." },
];

export default function TemplateSequence() {
  return (
    <section aria-label="The layouts" className="mx-auto max-w-6xl px-6 py-24">
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
