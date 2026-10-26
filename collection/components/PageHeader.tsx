import GlassToolbar from "./GlassToolbar";
import Mark from "./Mark";

/** Inner pages: the brand and the toolbar at docked size. */
export default function PageHeader() {
  return (
    <header className="page-head">
      <a className="brand" href="/" aria-label="Spiral home">
        <Mark />
        <span>Spiral</span>
      </a>
      <GlassToolbar compact />
    </header>
  );
}
