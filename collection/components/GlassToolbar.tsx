"use client";

import { type KeyboardEvent, useLayoutEffect, useRef } from "react";
import { CHECKOUT_URL } from "@/lib/checkout";
import Icon from "./Icons";

export type Product = "wallpaper" | "resume";

export const PRODUCTS: { id: Product; label: string; icon: "image" | "doc" }[] = [
  { id: "wallpaper", label: "Wallpaper", icon: "image" },
  { id: "resume", label: "Resume", icon: "doc" },
];

interface SwitchProps {
  /** Home page: the capsules switch the page below. */
  product: Product;
  onSelect: (p: Product) => void;
  compact?: false;
}

interface LinkProps {
  /** Inner pages: the same object, small, and the capsules are links home. */
  product?: undefined;
  onSelect?: undefined;
  compact: true;
}

/**
 * The Spiral toolbar: a recessed red-glass pill with two raised capsules and a
 * round dome. It is the hero, the navigation and the app's own chrome.
 */
export default function GlassToolbar(props: SwitchProps | LinkProps) {
  const seg = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const { product } = props;
  const home = !props.compact;

  // Slide the capsule onto the selected tab. Both tabs share one width, so only
  // the transform moves; the offset is read from the real button.
  useLayoutEffect(() => {
    if (!product) return;
    const place = () => {
      const tab = seg.current?.querySelector<HTMLElement>(`[data-p="${product}"]`);
      const t = thumb.current;
      if (!tab || !t) return;
      t.style.setProperty("--tx", `${tab.offsetLeft}px`);
    };
    place();
    const ro = new ResizeObserver(place);
    if (seg.current) ro.observe(seg.current);
    document.fonts?.ready.then(place);
    return () => ro.disconnect();
  }, [product]);

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (!props.onSelect) return;
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = PRODUCTS[(i + (e.key === "ArrowRight" ? 1 : PRODUCTS.length - 1)) % 2];
    props.onSelect(next.id);
    seg.current?.querySelector<HTMLElement>(`[data-p="${next.id}"]`)?.focus();
  }

  return (
    <nav className={home ? "tb" : "tb tb--compact"} aria-label="Spiral">
      <div className="tb-pill">
        <a className="tb-ib" href={home ? "#privacy" : "/privacy/"} aria-label="Privacy">
          <Icon name="lock" />
        </a>
        <a className="tb-ib" href={home ? "#price" : "/#price"} aria-label="Price">
          <Icon name="tag" />
        </a>
        {home ? (
          <div className="tb-seg" role="tablist" aria-label="Product" ref={seg}>
            <span className="tb-thumb" ref={thumb} aria-hidden="true" />
            {PRODUCTS.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                id={`tab-${p.id}`}
                aria-controls={p.id}
                aria-selected={product === p.id}
                tabIndex={product === p.id ? 0 : -1}
                data-p={p.id}
                className="tb-tab"
                onClick={() => props.onSelect?.(p.id)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <Icon name={p.icon} />
                {p.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="tb-seg">
            {PRODUCTS.map((p) => (
              <a key={p.id} href={`/#${p.id}`} className="tb-tab">
                <Icon name={p.icon} />
                {p.label}
              </a>
            ))}
          </div>
        )}
      </div>
      <a
        className="tb-dome"
        href={CHECKOUT_URL}
        rel="noopener noreferrer"
        aria-label="Buy Spiral, $15 once"
      >
        <Icon name="plus" />
      </a>
      {home ? (
        <span className="tb-cap" aria-hidden="true">
          <b>Buy Spiral</b> $15 once
        </span>
      ) : null}
    </nav>
  );
}
