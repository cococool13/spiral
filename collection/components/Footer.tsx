import type { ReactNode } from "react";
import { apps } from "@/lib/apps";

const EMAIL = "cohencool@icloud.com";
const GITHUB = "https://github.com/cococool13";
const PLACE = "Athens, Georgia";

const appLinks = apps.filter((a) => a.page);
const year = new Date().getFullYear();

const elsewhere = [
  { href: "/#apps", label: "Collection", external: false },
  { href: "/#other-work", label: "Other Work", external: false },
  { href: GITHUB, label: "GitHub", external: true },
];

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-paper/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 pt-20 pb-10 sm:pt-28 sm:pb-14">
        <p className="type-display footer-wordmark text-paper">
          Spiral<span className="text-red">.</span>
        </p>

        <div className="mt-16 grid gap-10 border-t border-paper/10 pt-12 sm:grid-cols-3">
          <FooterCol title="Apps">
            {appLinks.map((app) => (
              <li key={app.slug}>
                {app.page ? (
                  <a
                    href={app.page}
                    className="flex min-h-11 items-center text-sm text-gray transition-colors hover:text-paper"
                  >
                    {app.name.replace("Spiral ", "")}
                  </a>
                ) : null}
              </li>
            ))}
          </FooterCol>

          <FooterCol title="Elsewhere">
            {elsewhere.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  target={link.external ? "_blank" : undefined}
                  rel={link.external ? "noopener noreferrer" : undefined}
                  className="flex min-h-11 items-center text-sm text-gray transition-colors hover:text-paper"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </FooterCol>

          <FooterCol title="Contact">
            <li>
              <a
                href={`mailto:${EMAIL}`}
                className="flex min-h-11 items-center text-sm text-gray underline decoration-paper/20 underline-offset-4 transition-colors hover:text-paper hover:decoration-red"
              >
                {EMAIL}
              </a>
            </li>
            <li>
              <span className="flex min-h-11 items-center text-sm text-gray">
                {PLACE}
              </span>
            </li>
          </FooterCol>
        </div>

        <p className="type-heading mt-20 max-w-xl text-2xl text-paper italic sm:text-3xl">
          Close the window and nothing keeps running.
        </p>

        <p className="mt-12 flex flex-wrap gap-x-6 gap-y-2 font-mono text-micro uppercase tracking-widest text-gray">
          <span>© {year}</span>
          <span>Cohen Coolidge</span>
          <span>MIT</span>
          <span>Georgia</span>
        </p>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-mono text-micro uppercase tracking-widest text-paper">{title}</p>
      <ul className="mt-3">{children}</ul>
    </div>
  );
}
