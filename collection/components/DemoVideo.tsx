"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface Props {
  video: { mp4: string; webm: string; poster: string };
  name: string;
}

/**
 * Lazy, muted, looping product demo. Sources live in /brand/media —
 * until Cohen drops in the Screen Studio export, the styled fallback frame
 * renders instead of a broken player.
 */
export default function DemoVideo({ video, name }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const [available, setAvailable] = useState(false);
  // A looping demo is moving content that starts on its own, so it needs a
  // way to stop it (WCAG 2.2.2) and must not start under reduced motion.
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);

  // Only the toggle drives this. First play is declarative, via autoPlay.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (playing) void el.play().catch(() => {});
    else el.pause();
  }, [playing]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setInView(true),
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Source-element failures don't reliably bubble to <video onError>, so
  // probe once before mounting the player.
  useEffect(() => {
    if (!inView) return;
    fetch(video.mp4, { method: "HEAD" })
      .then((r) =>
        setAvailable(r.ok && !r.headers.get("content-type")?.includes("text/html")),
      )
      .catch(() => setAvailable(false));
  }, [inView, video.mp4]);

  return (
    <div
      ref={ref}
      className="relative aspect-video w-full overflow-hidden rounded-[2px] border border-white/10 bg-black"
    >
      {inView && available ? (
        <>
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            autoPlay={!reduced}
            muted
            loop
            playsInline
            poster={video.poster}
            aria-label={`${name} demo: browsing wallpapers and applying one`}
          >
            <source src={video.webm} type="video/webm" />
            <source src={video.mp4} type="video/mp4" />
          </video>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? `Pause the ${name} demo` : `Play the ${name} demo`}
            className="absolute bottom-3 right-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[2px] border border-white/20 bg-black/60 px-3 font-mono text-xs text-paper backdrop-blur transition-colors hover:border-white/40"
          >
            {playing ? "Pause" : "Play"}
          </button>
        </>
      ) : (
        <FallbackFrame />
      )}
    </div>
  );
}

/** Designed placeholder: miniature app window on concrete, in-brand. */
function FallbackFrame() {
  return (
    <div
      aria-hidden="true"
      className="flex h-full w-full items-center justify-center"
      style={{
        background:
          "radial-gradient(80% 100% at 50% 0%, rgba(213,46,43,.12), transparent 60%), linear-gradient(180deg,#141416,#0b0b0c)",
      }}
    >
      <div className="w-3/4 border border-white/15 bg-conc1 shadow-[rgba(0,0,0,.08)_0_24px_48px]">
        <div className="flex items-center gap-1.5 border-b border-conc3 px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-conc3" />
          <span className="h-2 w-2 rounded-full bg-conc3" />
          <span className="h-2 w-2 rounded-full bg-conc3" />
          <span className="ml-2 font-mono text-[9px] uppercase tracking-widest text-steel">
            Spiral Wallpaper
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative skeleton; tiles never reorder
              key={i}
              className={`aspect-video ${i === 1 ? "bg-red" : i % 2 ? "bg-conc2" : "bg-conc3"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
