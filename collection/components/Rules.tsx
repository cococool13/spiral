import Reveal from "./Reveal";
import Scramble from "./Scramble";

/**
 * The four refusals as editorial scaffolding: four hairline cells, four
 * monumental readings, a mono label over each. They decode as the board comes
 * into view. Every value is a claim the apps already make in their READMEs
 * and the site metadata.
 */
const READINGS: { label: string; value: string; note: string }[] = [
  { label: "Accounts", value: "0", note: "Nothing to sign in to." },
  { label: "Telemetry", value: "0", note: "No usage data leaves the machine." },
  { label: "Background processes", value: "0", note: "Nothing runs once you quit." },
  { label: "Price", value: "$0", note: "No tier, no trial, no upgrade." },
];

export default function Rules() {
  return (
    <section id="rules" className="board">
      <div className="board-shell">
        <div className="board-head">
          <p className="obs-readout">03 / The rules</p>
        </div>
        <dl className="board-grid">
          {READINGS.map((r, i) => (
            <Reveal key={r.label} step={i} className="board-cell">
              <dt className="board-label">{r.label}</dt>
              <Scramble
                as="dd"
                text={r.value}
                delay={i * 110}
                className="board-value type-display"
              />
              <dd className="board-note">{r.note}</dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
