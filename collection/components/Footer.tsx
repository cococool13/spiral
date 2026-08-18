"use client";

import { useEffect, useRef } from "react";
import { apps } from "@/lib/apps";

const EMAIL = "cohencool@icloud.com";
const GITHUB = "https://github.com/cococool13";

/** The four app pages, in catalogue order. Derived so a new page cannot be
    added to `apps.ts` and quietly miss the footer. */
const appLinks = apps.filter((a) => a.page);

const elsewhere = [
  { href: GITHUB, label: "GitHub", external: true },
  { href: "/#other-work", label: "Other Work", external: false },
];

/**
 * The footer is a room you are looking into.
 *
 * One-point perspective: a dark back panel with light leaking around its rim,
 * and four walls running from that rim out to the frame. It is the same claim
 * the rest of the site makes about light — it comes from a fixture, and
 * surfaces only ever reflect it.
 *
 * Everything sits over the room at z-10. The wordmark is set enormous and
 * clipped by the footer's own bottom edge, which is what stops the page rather
 * than a rule and a copyright line doing it alone.
 */
export default function Footer() {
  return (
    /* A min-height, not padding: the room needs enough of the viewport's
       width-to-height ratio to still read as a room rather than a slot. */
    <footer className="relative flex min-h-[30rem] flex-col overflow-hidden border-t border-white/10 lg:min-h-[36rem]">
      <FooterRoom />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 pb-12 pt-20 lg:pt-24">
        <div className="flex flex-col gap-12 lg:flex-row lg:justify-between lg:gap-10">
          {/* The last word */}
          <div>
            <h2 className="type-display text-[2rem] text-paper sm:text-5xl lg:text-[3.25rem]">
              No accounts.
              <br />
              No telemetry.
              <br />
              Free, always.
            </h2>
            <p className="mt-7 font-mono text-xs uppercase tracking-widest text-gray">
              Questions, bugs, or ideas
            </p>
            <a
              href={`mailto:${EMAIL}`}
              className="mt-2 inline-flex min-h-11 items-center font-mono text-sm text-paper underline decoration-white/25 underline-offset-4 transition-colors hover:text-red hover:decoration-red"
            >
              {EMAIL}
            </a>
          </div>

          <div className="flex gap-12 sm:gap-16 lg:gap-14">
            <FooterNav title="Apps">
              {appLinks.map((app) => (
                <FooterLink key={app.slug} href={app.page as string}>
                  {app.name.replace("Spiral ", "")}
                </FooterLink>
              ))}
            </FooterNav>
            <FooterNav title="Elsewhere">
              {elsewhere.map((item) => (
                <FooterLink key={item.label} href={item.href} external={item.external}>
                  {item.label}
                </FooterLink>
              ))}
            </FooterNav>
          </div>

          <div className="flex gap-3">
            <IconLink href={GITHUB} label="Spiral on GitHub" external>
              <path
                fill="currentColor"
                stroke="none"
                d="M12 1.5a10.5 10.5 0 0 0-3.32 20.46c.53.1.72-.23.72-.5v-1.8c-2.92.64-3.54-1.4-3.54-1.4-.48-1.22-1.17-1.54-1.17-1.54-.95-.65.08-.64.08-.64 1.06.07 1.61 1.09 1.61 1.09.94 1.6 2.46 1.14 3.06.87.1-.68.37-1.14.66-1.4-2.33-.27-4.78-1.17-4.78-5.19 0-1.15.4-2.09 1.08-2.82-.11-.27-.47-1.34.1-2.8 0 0 .88-.28 2.88 1.08a9.9 9.9 0 0 1 5.24 0c2-1.36 2.88-1.08 2.88-1.08.57 1.46.21 2.53.1 2.8.68.73 1.08 1.67 1.08 2.82 0 4.03-2.46 4.92-4.8 5.18.38.33.72.97.72 1.96v2.9c0 .28.19.61.73.5A10.5 10.5 0 0 0 12 1.5Z"
              />
            </IconLink>
            <IconLink href={`mailto:${EMAIL}`} label={`Email ${EMAIL}`}>
              <path d="M3 6.5h18v11H3zM3 7l9 6.5L21 7" />
            </IconLink>
          </div>
        </div>

        {/* `mt-auto` rather than a margin: the copyright belongs on the
            footer's floor, however tall the room ends up. */}
        <p className="mt-auto pt-20 font-mono text-xs text-gray">
          © {new Date().getFullYear()} Spiral. Built by Cohen Coolidge.
        </p>
      </div>

      {/* The name, set as large as the frame allows and cut off by it. Purely
          decorative — the accessible name is already the copyright line above.

          `z-0`, deliberately below the content's `z-10`: past `lg` it clears
          the copyright on the other side of the footer, but on a narrow screen
          the two share the floor, and there it has to behave like the
          watermark it is and let the line read straight through it. */}
      <span
        aria-hidden="true"
        className="type-display pointer-events-none absolute -bottom-[0.16em] right-4 z-0 select-none text-[4.5rem] leading-none text-paper/10 sm:right-6 sm:text-[9rem] lg:text-[15rem]"
      >
        Spiral
      </span>
    </footer>
  );
}

function FooterNav({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <nav aria-label={title}>
      <h3 className="font-mono text-xs uppercase tracking-widest text-gray">{title}</h3>
      <ul className="mt-4 space-y-1">{children}</ul>
    </nav>
  );
}

function FooterLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : null)}
        /* `flex`, not `inline-flex`: inline the anchor is only as wide as its
           word, and "Slim" came out 28px wide against a 44px minimum.
           Block-level, each one fills its column. */
        className="flex min-h-11 items-center text-sm text-concrete transition-colors hover:text-red"
      >
        {children}
      </a>
    </li>
  );
}

/** 44px round target — the one pill radius, and the only shape that is not a
    square corner anywhere on this surface. */
function IconLink({
  href,
  label,
  external,
  children,
}: {
  href: string;
  label: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : null)}
      className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/50 text-concrete backdrop-blur-sm transition-colors hover:border-red hover:text-red"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </a>
  );
}

/* The room ---------------------------------------------------------------- */

/* The panel's edges are `--room-l/r/t/b`, declared on `.footer-room` in
   globals.css and re-declared at `lg`. They live there rather than here so the
   room can change shape with the viewport — see that rule for why it has to. */
const L = "var(--room-l)";
const R = "var(--room-r)";
const T = "var(--room-t)";
const B = "var(--room-b)";

/** A wall is a lit gradient running from the panel's rim out to the frame.
 *
 * Each one gets a box that is exactly its own band — not `inset-0` with a
 * clip. A full-box gradient under a clip only shows the sliver of itself that
 * survives the clip, which is how four "walls" first rendered as one flat
 * wash. The polygon coordinates below are therefore relative to each wall's
 * own box, not to the footer.
 *
 * The ceiling is the brightest and the side walls the dimmest, so the four
 * meet along visible creases instead of blending into a haze. */
const WALLS = [
  {
    key: "top",
    box: { left: "0", right: "0", top: "0", height: T },
    clip: `polygon(0 0, 100% 0, ${R} 100%, ${L} 100%)`,
    dir: "to top",
    rim: 92,
    mid: 55,
  },
  {
    key: "bottom",
    box: { left: "0", right: "0", top: B, bottom: "0" },
    clip: `polygon(0 100%, ${L} 0, ${R} 0, 100% 100%)`,
    dir: "to bottom",
    rim: 76,
    mid: 44,
  },
  {
    key: "left",
    box: { left: "0", width: L, top: "0", bottom: "0" },
    clip: `polygon(0 0, 100% ${T}, 100% ${B}, 0 100%)`,
    dir: "to left",
    rim: 60,
    mid: 33,
  },
  {
    key: "right",
    box: { right: "0", width: `calc(100% - ${R})`, top: "0", bottom: "0" },
    clip: `polygon(100% 0, 100% 100%, 0 ${B}, 0 ${T})`,
    dir: "to right",
    rim: 60,
    mid: 33,
  },
];

/**
 * A dark room lit from behind its back panel.
 *
 * The geometry is static — only the lamp moves, and it moves on `transform`,
 * so following the pointer costs a composite and never a layout. Under a
 * coarse pointer or reduced motion no listener is bound at all and the room is
 * simply the lit still it already is.
 */
function FooterRoom() {
  const lamp = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = lamp.current;
    const box = host.current;
    if (!el || !box) return;

    // Checked live per event rather than snapshotted at mount: a media query
    // read once is wrong forever after if the setting changes. The pointer
    // type on the event itself is the honest signal for touch, so no
    // `(pointer: fine)` query is needed.
    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");

    let raf = 0;
    let x = 0;
    let y = 0;
    let lit = false;

    const paint = () => {
      raf = 0;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      el.style.opacity = lit ? "1" : "0";
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || reduceMq.matches) return;
      const r = box.getBoundingClientRect();
      const inside =
        e.clientY >= r.top &&
        e.clientY <= r.bottom &&
        e.clientX >= r.left &&
        e.clientX <= r.right;
      lit = inside;
      if (inside) {
        x = e.clientX - r.left;
        y = e.clientY - r.top;
      }
      wake();
    };
    const onLeave = () => {
      lit = false;
      wake();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={host} aria-hidden="true" className="footer-room absolute inset-0">
      <div className="absolute inset-0 bg-black" />

      {/* The light behind the panel. Blurred wide, so what reaches the room is
          a rim around the panel rather than a visible source. */}
      <div
        className="absolute mix-blend-screen"
        style={{
          /* Uneven insets on purpose: the footer is far wider than it is tall,
             so an equal percentage would spill much further past the panel's
             sides than its top and bottom and the rim would read as two
             vertical bars. These are matched by eye in pixels, not percent. */
          left: `calc(${L} - 3%)`,
          right: `calc(100% - ${R} - 3%)`,
          top: `calc(${T} - 6%)`,
          bottom: `calc(100% - ${B} - 6%)`,
          background: [
            "radial-gradient(closest-side,",
            "var(--spiral-red),",
            "color-mix(in oklab, var(--spiral-oxblood) 70%, transparent) 68%,",
            "transparent)",
          ].join(" "),
          filter: "blur(34px)",
        }}
      />

      {/* Four walls running from the rim out to the frame */}
      {WALLS.map(({ key, box, clip, dir, rim, mid }) => (
        <div
          key={key}
          className="absolute mix-blend-screen"
          style={{
            ...box,
            clipPath: clip,
            background: [
              `linear-gradient(${dir},`,
              `color-mix(in oklab, var(--spiral-red) ${rim}%, transparent),`,
              `color-mix(in oklab, var(--spiral-oxblood) ${mid}%, transparent) 34%,`,
              "transparent 94%)",
            ].join(" "),
          }}
        />
      ))}

      {/* The panel itself — the darkest thing on the page, which is what makes
          the rim read as light rather than as a wash.
          Its edge stays crisp (so does the reference's) but it is not flat
          black: it runs dark at the centre and warms toward its own corners,
          which is the rim spilling onto it. Painted flat, it read as a hole
          cut in the page rather than as the wall the room ends at. */}
      <div
        className="absolute"
        style={{
          left: L,
          right: `calc(100% - ${R})`,
          top: T,
          bottom: `calc(100% - ${B})`,
          background: [
            "radial-gradient(128% 128% at 50% 38%,",
            "var(--spiral-black) 0%,",
            "var(--spiral-black) 46%,",
            "color-mix(in oklab, var(--spiral-oxblood) 62%, var(--spiral-black)) 100%)",
          ].join(" "),
        }}
      />

      {/* The lamp: the room brightens where you point it. */}
      <div
        ref={lamp}
        /* Origin at its own centre (-16rem of a 32rem box), so following the
           pointer is a plain translate to the pointer's coordinates. */
        className="pointer-events-none absolute -left-64 -top-64 opacity-0 mix-blend-screen transition-opacity duration-500"
        style={{
          width: "32rem",
          height: "32rem",
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--spiral-red) 44%, transparent), transparent 70%)",
        }}
      />

      {/* Film grain, the same pass the hero uses */}
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full opacity-[.06]">
        <filter id="footer-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.68"
            numOctaves="2"
            seed="7"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#footer-grain)" />
      </svg>

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(120% 105% at 50% 46%, transparent 54%,",
            "color-mix(in oklab, var(--spiral-black) 52%, transparent) 100%)",
          ].join(" "),
        }}
      />

      {/* Band scrim. The copy lives in the top and bottom thirds and the room
          is brightest exactly there; this darkens those two bands and leaves
          the rim untouched, so contrast is bought without dimming the light. */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            "linear-gradient(180deg,",
            "color-mix(in oklab, var(--spiral-black) 46%, transparent) 0%,",
            "transparent 26%,",
            "transparent 62%,",
            "color-mix(in oklab, var(--spiral-black) 52%, transparent) 100%)",
          ].join(" "),
        }}
      />
    </div>
  );
}
