import { useEffect, useState } from "react";
import mark from "../assets/brand/mark-red.svg";

/** Covers cold start while the stored document and engine info load. The mark
 *  assembles from four corners, then the whole screen fades out. Reduced motion
 *  shows the mark at once and skips the wait. */
export function Splash({ leaving = false }: { leaving?: boolean }) {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    setReduce(
      typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  }, []);

  return (
    <div
      className={leaving ? "splash splash--out" : "splash"}
      role="status"
      aria-label="Loading Spiral Resume"
    >
      <span className={reduce ? "splash__mark splash__mark--whole" : "splash__mark"} aria-hidden="true">
        <span className="splash__piece splash__piece--a">
          <img src={mark} alt="" />
        </span>
        <span className="splash__piece splash__piece--b">
          <img src={mark} alt="" />
        </span>
        <span className="splash__piece splash__piece--c">
          <img src={mark} alt="" />
        </span>
        <span className="splash__piece splash__piece--d">
          <img src={mark} alt="" />
        </span>
      </span>
    </div>
  );
}
