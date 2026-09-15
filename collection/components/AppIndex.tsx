import { apps } from "@/lib/apps";
import ProductVisual from "./ProductVisual";

const descriptions: Record<string, string> = {
  wallpaper:
    "Find a wallpaper on Wallhaven. Click it. It downloads and applies to your desktop.",
  slim: "Review the policies. Choose what changes. A Brave wizard on Mac, with scripts for four browsers.",
  resume:
    "Twelve typeset layouts. Export PDF and Word from one source, with your facts kept in place.",
  clean:
    "Three rules for what can be deleted, what goes to Trash, and what must never be touched.",
};
const platforms: Record<string, string> = {
  wallpaper: "macOS + Windows",
  slim: "macOS wizard · cross-platform scripts",
  resume: "macOS + Windows",
  clean: "In development · no download",
};

export default function AppIndex() {
  const listed = apps
    .filter((app) => app.page)
    .toSorted(
      (a, b) => Number(a.status === "coming-soon") - Number(b.status === "coming-soon"),
    );
  return (
    <section id="apps" className="parts-sheet">
      <div className="shell">
        <div className="section-heading">
          <h2>
            Parts list.
            <br />
            One job each.
          </h2>
          <p>
            Real output in the frame.
            <br />
            Pick an app and open its page.
          </p>
        </div>
        <div className="product-grid">
          {listed.map((app, i) => (
            <article className="product-entry" key={app.slug}>
              <a
                className="product-entry-visual"
                href={app.page}
                aria-label={`Explore ${app.name}`}
              >
                <ProductVisual slug={app.slug} />
              </a>
              <div className="product-entry-title">
                <span className="meta-id">
                  {String(i + 1).padStart(2, "0")} / {app.slug.toUpperCase()}
                </span>
                <h3>
                  <a href={app.page}>{app.name.replace("Spiral ", "")}</a>
                </h3>
                <span className="product-status">
                  {app.status === "live" ? `v${app.version}` : "In development"}
                </span>
              </div>
              <p className="product-description">
                {descriptions[app.slug] ?? app.tagline}
              </p>
              <div className="product-entry-foot">
                <span>{platforms[app.slug]}</span>
                <a href={app.page}>
                  {app.status === "live" ? "Open app page" : "See the approach"}{" "}
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
