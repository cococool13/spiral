import Image from "next/image";

/** Actual document output or explicitly labelled explanatory material. */
export default function ProductVisual({
  slug,
  priority = false,
}: {
  slug: string;
  priority?: boolean;
}) {
  if (slug === "resume") {
    return (
      <div className="product-visual visual-resume">
        <span className="visual-label">Actual output / Column + Ledger</span>
        <div className="resume-sheets">
          <Image
            src="/resume/ledger.svg"
            alt="Sample resume in the Ledger layout"
            width={612}
            height={792}
            loading={priority ? "eager" : "lazy"}
            className="resume-sheet resume-sheet--back"
          />
          <Image
            src="/resume/column.svg"
            alt="Sample resume in the Column layout"
            width={612}
            height={792}
            loading={priority ? "eager" : "lazy"}
            className="resume-sheet"
          />
        </div>
        <span className="visual-foot">
          12 layouts <span>PDF + Word</span>
        </span>
      </div>
    );
  }
  if (slug === "wallpaper") {
    return (
      <div className="product-visual visual-wallpaper">
        <span className="visual-label">The idea / a different view</span>
        <div className="wallpaper-picture">
          <Image
            src="/brand/hero/hero-exit.webp"
            alt="Illustrative wallpaper: a corridor opening onto daylight"
            width={2400}
            height={1350}
            loading={priority ? "eager" : "lazy"}
          />
        </div>
        <span className="visual-foot">
          Pick a wallpaper <span>Click. Applied.</span>
        </span>
      </div>
    );
  }
  return null;
}
