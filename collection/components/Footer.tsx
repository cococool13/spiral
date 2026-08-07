"use client";

import { useEffect, useRef, useState } from "react";

const EMAIL = "cohencool@icloud.com";

export default function Footer() {
  const [contactOpen, setContactOpen] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);

  // The popover is a transient disclosure: Escape and any click outside it
  // dismiss, so it never sits open behind the rest of the page.
  useEffect(() => {
    if (!contactOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContactOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (!contactRef.current?.contains(e.target as Node)) setContactOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [contactOpen]);

  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-6 py-16 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="block h-6 w-6 bg-red"
            style={{
              maskImage: "url(/brand/logo/mark.svg)",
              WebkitMaskImage: "url(/brand/logo/mark.svg)",
              maskSize: "contain",
              WebkitMaskSize: "contain",
              maskRepeat: "no-repeat",
              WebkitMaskRepeat: "no-repeat",
              maskPosition: "center",
              WebkitMaskPosition: "center",
            }}
          />
          <span className="font-mono text-xs uppercase tracking-widest text-gray">
            Free. Always.
          </span>
        </div>
        <nav className="flex gap-4 font-mono text-xs text-gray">
          <a
            href="https://github.com/cococool13"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-3 transition-colors hover:text-paper"
          >
            GitHub
          </a>
          <div ref={contactRef} className="relative">
            {contactOpen && (
              <div
                role="dialog"
                aria-label="Contact"
                className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 border border-white/15 bg-black px-3 py-2 rounded-[2px] shadow-lg"
              >
                <a
                  href={`mailto:${EMAIL}`}
                  className="block whitespace-nowrap text-paper transition-colors hover:text-red"
                >
                  {EMAIL}
                </a>
              </div>
            )}
            <button
              type="button"
              aria-expanded={contactOpen}
              onClick={() => setContactOpen((open) => !open)}
              className="px-2 py-3 transition-colors hover:text-paper"
            >
              Contact
            </button>
          </div>
          <a href="#other-work" className="px-2 py-3 transition-colors hover:text-paper">
            Other Work
          </a>
        </nav>
      </div>
    </footer>
  );
}
