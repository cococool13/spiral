"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import GlassToolbar, { PRODUCTS, type Product } from "./GlassToolbar";
import Mark from "./Mark";
import ResumeStage from "./ResumeStage";
import WallpaperStage from "./WallpaperStage";

const HEADLINES: Record<Product, string> = {
  wallpaper: "Click a wallpaper. It is set.",
  resume: "Same facts. A better page.",
};

const DOCK_TOP = 12;
const DOCK_HEIGHT = 58;

/**
 * Hero and stage. The toolbar starts as the hero object and, as the page
 * scrolls, rises and shrinks into the docked navigation. Same element, one
 * transform, driven by scroll position (so it never runs on its own).
 */
export default function Landing({ children }: { children: ReactNode }) {
  const [product, setProduct] = useState<Product>("wallpaper");
  const wrap = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);

  const select = useCallback((p: Product, scroll = false) => {
    setProduct(p);
    history.replaceState(null, "", `#${p}`);
    if (scroll) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      stage.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    }
  }, []);

  // /#wallpaper and /#resume (the old routes redirect here) open that section.
  useEffect(() => {
    const fromHash = () => {
      const h = location.hash.slice(1);
      if (h === "wallpaper" || h === "resume") select(h, true);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [select]);

  useLayoutEffect(() => {
    const w = wrap.current;
    const s = slot.current;
    if (!w || !s) return;
    let raf = 0;
    let slotTop = 0;
    let slotX = 0;
    let width = 0;
    let height = 0;
    const measure = () => {
      w.classList.remove("is-live");
      w.style.transform = "";
      const r = s.getBoundingClientRect();
      slotTop = r.top + window.scrollY;
      slotX = r.left + r.width / 2;
      const tb = w.firstElementChild as HTMLElement | null;
      width = tb?.offsetWidth ?? w.offsetWidth;
      height = w.offsetHeight;
      s.style.height = `${height}px`;
      w.classList.add("is-live");
      dock();
    };
    const dock = () => {
      raf = 0;
      const y = window.scrollY;
      const travel = Math.max(1, slotTop - DOCK_TOP);
      const t = Math.min(1, y / travel);
      const e = t * t * (3 - 2 * t);
      const scale = 1 + (Math.min(1, DOCK_HEIGHT / height) - 1) * e;
      const top = Math.max(slotTop - y, DOCK_TOP);
      // Centre on the slab at rest, on the viewport when docked.
      const cx = slotX + (window.innerWidth / 2 - slotX) * e;
      w.style.transform = `translate(${(cx - width / 2).toFixed(1)}px, ${top.toFixed(1)}px) scale(${scale.toFixed(4)})`;
      w.classList.toggle("is-docked", t > 0.55);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(dock);
    };
    measure();
    document.fonts?.ready.then(measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <>
      <header className="hero">
        <svg className="hero-grid" aria-hidden="true">
          <line x1="2.4%" y1="0" x2="2.4%" y2="100%" />
          <line x1="25%" y1="0" x2="25%" y2="100%" />
          <line x1="50%" y1="0" x2="50%" y2="100%" />
          <line x1="75%" y1="0" x2="75%" y2="100%" />
          <line x1="97.6%" y1="0" x2="97.6%" y2="100%" />
          <line x1="0" y1="72%" x2="100%" y2="72%" />
          <line x1="0" y1="84%" x2="100%" y2="84%" />
          <line x1="0" y1="96%" x2="100%" y2="96%" />
        </svg>
        <div className="bezel">
          <a className="brand" href="/" aria-label="Spiral home">
            <Mark />
            <span>Spiral</span>
          </a>
          <h1>
            {PRODUCTS.map((p) => (
              <span key={p.id} aria-hidden={product !== p.id}>
                {HEADLINES[p.id]}
              </span>
            ))}
          </h1>
          <div className="hero-slot" ref={slot}>
            <div className="tb-wrap" ref={wrap}>
              <GlassToolbar product={product} onSelect={(p) => select(p)} />
            </div>
          </div>
        </div>
        <p className="hero-foot">
          <span>Wallpaper and Resume</span>
          <span>Mac and Windows</span>
        </p>
      </header>

      <main id="content">
        <section className="stage" ref={stage} aria-label="What Spiral does">
          {PRODUCTS.map((p) => (
            <div
              key={p.id}
              id={p.id}
              role="tabpanel"
              aria-labelledby={`tab-${p.id}`}
              className="panel"
              hidden={product !== p.id}
            >
              {p.id === "wallpaper" ? (
                <WallpaperStage active={product === "wallpaper"} />
              ) : (
                <ResumeStage />
              )}
            </div>
          ))}
        </section>
        {children}
      </main>
    </>
  );
}
