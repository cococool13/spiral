import { apps } from "@/lib/apps";

const EMAIL = "cohencool@icloud.com";
const GITHUB = "https://github.com/cococool13";

const appLinks = apps.filter((a) => a.page);

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/10 bg-black">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12 sm:py-16">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="type-heading text-lg text-paper">Spiral</p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-gray">
              Small tools. No bloat. Your data stays yours.
            </p>
            <a
              href={`mailto:${EMAIL}`}
              className="mt-4 inline-flex min-h-11 items-center text-sm text-paper underline decoration-white/25 underline-offset-4 transition-colors hover:text-red hover:decoration-red"
            >
              {EMAIL}
            </a>
          </div>

          <nav aria-label="Footer">
            <ul className="flex flex-col sm:items-end">
              {appLinks.map((app) => (
                <li key={app.slug}>
                  <a
                    href={app.page as string}
                    className="flex min-h-11 items-center text-sm text-gray transition-colors hover:text-paper sm:justify-end"
                  >
                    {app.name.replace("Spiral ", "")}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={GITHUB}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center text-sm text-gray transition-colors hover:text-paper sm:justify-end"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <p className="text-sm text-gray">
          © {new Date().getFullYear()} Spiral. Built by Cohen Coolidge.
        </p>
      </div>
    </footer>
  );
}
