import { apps } from "@/lib/apps";
import ProductVisual from "./ProductVisual";

export default function AppIndex() {
  const product = apps[0];
  return (
    <section id="apps" className="parts-sheet">
      <div className="shell">
        <div className="section-heading">
          <h2>
            Parts list.
            <br />
            One app.
          </h2>
          <p>
            Wallpaper and Resume are sections of Spiral.
            <br />
            The download is Spiral Wallpaper 1.0.4, the build that is published.
          </p>
        </div>
        <div className="product-grid">
          {product.sections.map((section, i) => (
            <article className="product-entry" id={section.id} key={section.id}>
              <a
                className="product-entry-visual"
                href={`#${section.id}`}
                aria-label={section.name}
              >
                <ProductVisual slug={section.id} />
              </a>
              <div className="product-entry-title">
                <span className="meta-id">
                  {String(i + 1).padStart(2, "0")} / {section.id.toUpperCase()}
                </span>
                <h3>
                  <a href={`#${section.id}`}>{section.name}</a>
                </h3>
                <span className="product-status">v{product.version}</span>
              </div>
              <p className="product-description">{section.summary}</p>
              <div className="product-entry-foot">
                <span>macOS and Windows</span>
                {section.previousRelease ? (
                  <a href={section.previousRelease}>
                    Resume 0.1.2 release <span aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <a href="#top">
                    Back to the top <span aria-hidden="true">↑</span>
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
