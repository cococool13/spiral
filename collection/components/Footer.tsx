import { apps } from "@/lib/apps";
import { RESEND_URL } from "@/lib/checkout";
import AsciiMark from "./AsciiMark";
import GlassWordmark from "./GlassWordmark";

const EMAIL = "cohenbcoolidge@gmail.com";
const GITHUB = "https://github.com/cococool13";

const COLUMNS: {
  title: string;
  links: { href: string; label: string; external?: true }[];
}[] = [
  {
    title: "Spiral",
    links: [
      ...apps[0].sections.map((s) => ({ href: `/#${s.id}`, label: s.name })),
      { href: "/#price", label: "Price" },
      {
        href: apps[0].downloads?.all ?? "/#price",
        label: "All downloads",
        external: true,
      },
    ],
  },
  {
    title: "After you buy",
    links: [
      { href: "/thanks/", label: "Set up" },
      { href: RESEND_URL, label: "Lost key", external: true },
      { href: "/privacy/", label: "Privacy" },
    ],
  },
  {
    title: "Cohen Coolidge",
    links: [
      { href: `mailto:${EMAIL}`, label: EMAIL },
      { href: GITHUB, label: "GitHub", external: true },
      { href: "/work/", label: "Other work" },
      {
        href: "https://github.com/cococool13/spiral/blob/main/LICENSE",
        label: "MIT licence",
        external: true,
      },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="foot">
      <div className="foot-top">
        <AsciiMark />
        <div>
          <div className="cols">
            {COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h2>{col.title}</h2>
                <ul>
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <a
                        href={l.href}
                        {...(l.external
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <p className="legal">
            © 2026 Cohen Coolidge. Source is public; the app needs a key.
          </p>
        </div>
      </div>
      <GlassWordmark />
    </footer>
  );
}
