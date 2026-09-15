"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apps } from "@/lib/apps";
import { WHOP_CHECKOUT_URL } from "@/lib/whop";
import DownloadMenu from "./DownloadMenu";
import Mark from "./Mark";

const links = [
  { href: "/#apps", label: "The apps" },
  { href: "/#rules", label: "Our approach" },
  { href: "/work/", label: "Other work" },
];

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onEscape);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  return (
    <header className="nav" ref={header}>
      <nav className="nav-bar shell" aria-label="Main navigation">
        <a href="/" className="nav-brand" aria-label="Spiral home">
          <Mark size={26} className="nav-mark" />
          <span className="nav-name">Spiral</span>
        </a>
        <ul className="nav-links">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="nav-link"
                aria-current={pathname === link.href ? "page" : undefined}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="nav-action">
          <div className="nav-download">
            <DownloadMenu />
          </div>
          <a
            href={WHOP_CHECKOUT_URL}
            className="glass-pill glass-pill--nav"
            rel="noopener noreferrer"
          >
            Buy — $9.99
          </a>
          <button
            ref={toggle}
            type="button"
            className="nav-toggle"
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? "Close" : "Menu"}
            <span aria-hidden="true">{open ? "−" : "+"}</span>
          </button>
        </div>
      </nav>
      <nav
        id="mobile-navigation"
        aria-label="Mobile navigation"
        className="mobile-navigation"
        hidden={!open}
      >
        <div className="shell">
          <p className="meta-id">The collection</p>
          <ul>
            {apps
              .filter((app) => app.page)
              .map((app) => (
                <li key={app.slug}>
                  <a href={app.page} onClick={() => setOpen(false)}>
                    {app.name.replace("Spiral ", "")}
                    <span aria-hidden="true">↗</span>
                  </a>
                </li>
              ))}
          </ul>
          <div className="mobile-secondary">
            {[
              ...links.slice(1),
              { href: "/privacy/", label: "Privacy" },
              { href: "/thanks/", label: "Already purchased?" },
            ].map((link) => (
              <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </nav>
    </header>
  );
}
