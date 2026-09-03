import { apps } from "@/lib/apps";
import Mark from "./Mark";
import Reveal from "./Reveal";

/** One measured fact per app — not a slogan. */
const PROOF: Record<string, string> = {
  wallpaper: "4.6 MB. Click, it applies.",
  slim: "Brave on Mac. Scripts for four browsers.",
  clean: "Not released. Delete, Trash, or never touch.",
  resume: "Twelve layouts. A moved digit or name is discarded.",
};

const STATUS_LABEL: Record<(typeof apps)[number]["status"], string> = {
  live: "Live",
  source: "Source",
  "coming-soon": "Coming soon",
};

/**
 * Four frames drawn in light. Each is set the way the app's own bar is set —
 * the mark, "Spiral" receding, the app's word carrying the line — with one
 * mono status line at the top and one proof line at the foot. Nothing else.
 * On hover the frame brightens and the mark turns helix.
 */
export default function AppIndex() {
  const listed = apps.filter((app) => app.page);

  return (
    <section id="apps" className="frames">
      <div className="frames-shell">
        <div className="frames-head">
          <p className="obs-readout">02 / The apps</p>
          <Reveal as="h2" className="type-display frames-title">
            One job each.
          </Reveal>
        </div>

        <ul className="frames-grid">
          {listed.map((app, i) => {
            const short = app.name.replace("Spiral ", "");
            const live = app.status === "live";
            return (
              <Reveal as="li" step={i} key={app.slug}>
                <a href={app.page} className="frame">
                  <span className={`frame-status${live ? " frame-status--live" : ""}`}>
                    {STATUS_LABEL[app.status]}
                    {app.version ? ` · ${app.version}` : ""}
                  </span>

                  <span className="frame-name">
                    <Mark size={28} className="frame-mark" />
                    <span className="type-heading frame-lockup">
                      <span className="frame-lockup-collection">Spiral</span>
                      <span className="frame-lockup-app">{short}</span>
                    </span>
                  </span>

                  <span className="frame-proof">{PROOF[app.slug] ?? app.tagline}</span>
                </a>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
