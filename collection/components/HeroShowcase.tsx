"use client";

import { useState } from "react";
import ProductVisual from "./ProductVisual";

const previews = [
  { slug: "resume", name: "Resume", line: "Your words. Properly set." },
  { slug: "wallpaper", name: "Wallpaper", line: "A new view in one click." },
  { slug: "slim", name: "Slim", line: "A browser with less baggage." },
  { slug: "clean", name: "Clean", line: "Safe reclaim. Rules first." },
];

export default function HeroShowcase() {
  const [active, setActive] = useState(previews[0]);
  return (
    <div className="hero-showcase">
      <fieldset className="showcase-controls" aria-label="Preview an app">
        {previews.map((item, i) => (
          <button
            key={item.slug}
            type="button"
            aria-pressed={active.slug === item.slug}
            onClick={() => setActive(item)}
          >
            <span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
            {item.name}
          </button>
        ))}
      </fieldset>
      <div className="showcase-stage" key={active.slug}>
        <ProductVisual slug={active.slug} priority />
      </div>
      <div className="showcase-caption" aria-live="polite">
        <span>{active.line}</span>
        <a href={`/${active.slug}/`}>
          Open {active.name} <span aria-hidden="true">↗</span>
        </a>
      </div>
    </div>
  );
}
