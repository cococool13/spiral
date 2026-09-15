import Image from "next/image";
import { SLIM_POLICIES } from "@/lib/slimPolicies";

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
  if (slug === "slim") {
    return (
      <div className="product-visual visual-slim">
        <span className="visual-label">Policy preview / Brave</span>
        <div className="policy-specimen">
          <p className="policy-heading">
            Less browser.
            <br />
            More control.
          </p>
          {SLIM_POLICIES.slice(0, 3).map((policy) => (
            <div className="policy-specimen-row" key={policy}>
              <span>{policy}</span>
              <span aria-hidden="true">↗</span>
            </div>
          ))}
          <p className="policy-total">
            {SLIM_POLICIES.length} policies. Review before applying.
          </p>
        </div>
        <span className="visual-foot">
          See every change <span>Then approve it.</span>
        </span>
      </div>
    );
  }
  return (
    <div className="product-visual visual-clean">
      <span className="visual-label">Removal rules / in development</span>
      <div className="removal-specimen">
        <p>
          <span>01</span>Safe catalogue<strong>Delete</strong>
        </p>
        <p>
          <span>02</span>Other removals<strong>Trash</strong>
        </p>
        <p>
          <span>03</span>Your files<strong>Never touch</strong>
        </p>
      </div>
      <span className="visual-foot">
        Defined before a scan <span>Not released.</span>
      </span>
    </div>
  );
}
