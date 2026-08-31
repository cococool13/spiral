import { apps } from "@/lib/apps";

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

export default function AppGrid() {
  const listed = apps.filter((app) => app.page);

  return (
    <section id="apps" className="app-index-section relative z-10">
      <div className="app-index-shell">
        <header className="app-index-header">
          <p className="type-eyebrow app-index-label">02 / Apps</p>
          <div>
            <h2 className="type-display app-index-title">One job each.</h2>
            <p className="app-index-intro">
              Small tools with a clear edge, measured by what they leave alone.
            </p>
          </div>
        </header>
        <ul className="app-index-grid">
          {listed.map((app, index) => {
            const short = app.name.replace("Spiral ", "");
            return (
              <li key={app.slug}>
                <a
                  href={app.page}
                  className="app-tile group focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red"
                >
                  <div className="app-tile-top">
                    <span>0{index + 1}</span>
                    <span>{STATUS_LABEL[app.status]}</span>
                  </div>
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="app-tile-icon"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.25"
                  >
                    <path d={app.iconPath} />
                  </svg>
                  <div className="app-tile-copy">
                    <h3 className="type-heading app-tile-title">{short}</h3>
                    <p className="app-tile-proof">{PROOF[app.slug] ?? app.tagline}</p>
                    <p className="app-tile-tagline">{app.tagline}</p>
                  </div>
                  <span aria-hidden="true" className="app-tile-arrow">
                    ↗
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
