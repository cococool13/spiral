import type { ReactNode } from "react";
import { apps } from "@/lib/apps";
import Mark from "./Mark";

const EMAIL = "cohencool@icloud.com";
const GITHUB = "https://github.com/cococool13";
const year = 2026;

const appLinks = apps.filter((a) => a.page);

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-paper/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="flex flex-col gap-14 sm:flex-row sm:items-start sm:justify-between">
          <a
            href="/"
            className="inline-flex min-h-11 items-center text-red focus-visible:outline-2 focus-visible:outline-red"
            aria-label="Spiral"
          >
            <Mark size={40} />
          </a>

          <div className="flex flex-wrap gap-16">
            <FooterCol title="Apps">
              {appLinks.map((app) =>
                app.page ? (
                  <li key={app.slug}>
                    <a
                      href={app.page}
                      className="flex min-h-11 items-center text-sm text-gray transition-colors hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red"
                    >
                      {app.name.replace("Spiral ", "")}
                    </a>
                  </li>
                ) : null,
              )}
            </FooterCol>
            <FooterCol title="Contact">
              <li>
                <a
                  href={`mailto:${EMAIL}`}
                  className="flex min-h-11 items-center text-sm text-gray transition-colors hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red"
                >
                  {EMAIL}
                </a>
              </li>
              <li>
                <a
                  href={GITHUB}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center text-sm text-gray transition-colors hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red"
                >
                  GitHub
                </a>
              </li>
            </FooterCol>
          </div>
        </div>

        <div className="mt-16 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[var(--radius-ctl)] bg-conc2 px-5 py-4 font-mono text-micro uppercase tracking-widest text-gray">
          <span>© {year} Cohen Coolidge</span>
          <span className="flex flex-wrap gap-x-6 gap-y-2">
            <a
              href="/privacy/"
              className="hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red"
            >
              Privacy
            </a>
            <a
              href="/work/"
              className="hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red"
            >
              Other work
            </a>
            <a
              href="https://github.com/cococool13/spiral/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red"
            >
              MIT
            </a>
            <a
              href="https://unsplash.com/photos/E_kMaBHrw0k"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red"
            >
              Photograph
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-mono text-micro uppercase tracking-widest text-paper">{title}</p>
      <ul className="mt-2">{children}</ul>
    </div>
  );
}
