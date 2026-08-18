/** Covers cold start while the stored document and engine info load. The mark
 *  assembles from four corners — that is the wait, not a show. Reduced motion
 *  skips the pieces and shows the whole mark. */
export function Splash() {
  return (
    <div className="splash" role="status" aria-label="Loading Spiral Resume">
      <span className="splash__mark" aria-hidden="true">
        <span className="splash__piece splash__piece--a" />
        <span className="splash__piece splash__piece--b" />
        <span className="splash__piece splash__piece--c" />
        <span className="splash__piece splash__piece--d" />
      </span>
    </div>
  );
}
