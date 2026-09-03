"use client";

import { usePathname } from "next/navigation";
import { apps } from "@/lib/apps";
import DownloadMenu from "./DownloadMenu";
import Mark from "./Mark";

const LINKS = [
  { href: "/#apps", label: "Apps" },
  { href: "/#rules", label: "Rules" },
  { href: "/work/", label: "Work", match: "/work" },
  { href: "/privacy/", label: "Privacy", match: "/privacy" },
];

/**
 * One slim bar, flush to the top, the same material as the page — no rule
 * under it, as the app bar is drawn. Mark and name left, mono links tracked
 * wide in the middle, the one filled action on the right. On an app page the
 * app's own word sits after the name, exactly as its bar shows it.
 */
export default function Nav() {
  const pathname = usePathname();
  const trimmed = pathname?.replace(/\/$/, "") ?? "";
  const current = apps.find((app) => app.page && app.page.replace(/\/$/, "") === trimmed);

  return (
    <header className="nav">
      <nav className="nav-bar">
        <a href="/" className="nav-brand">
          <Mark size={22} className="nav-mark" />
          <span className="nav-name">
            Spiral
            {current ? (
              <span className="nav-name-app" aria-current="page">
                {" "}
                {current.name.replace("Spiral ", "")}
              </span>
            ) : null}
          </span>
        </a>

        <ul className="nav-links">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                aria-current={l.match && trimmed === l.match ? "page" : undefined}
                className="nav-link"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="nav-action">
          <DownloadMenu />
        </div>
      </nav>
    </header>
  );
}
