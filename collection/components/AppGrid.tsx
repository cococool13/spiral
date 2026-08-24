import { apps } from "@/lib/apps";

/** One measured fact per app — not a slogan. */
const PROOF: Record<string, string> = {
  wallpaper: "4.6 MB. Click, it applies.",
  slim: "54 policies. Every change shown first.",
  clean: "Not released. Delete, Trash, or never touch.",
  resume: "Twelve layouts. A moved fact is discarded.",
};

export default function AppGrid() {
  const listed = apps.filter((app) => app.page);

  return (
    <section id="apps" className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
      <h2 className="type-display text-4xl text-paper sm:text-5xl">One job each.</h2>
      <ul className="mt-12">
        {listed.map((app) => {
          const short = app.name.replace("Spiral ", "");
          return (
            <li key={app.slug} className="border-t border-paper/10 last:border-b">
              <a
                href={app.page}
                className="group flex min-h-11 flex-col gap-1 py-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red sm:flex-row sm:items-baseline sm:justify-between sm:gap-8"
              >
                <span className="type-heading text-xl text-paper transition-colors group-hover:text-red">
                  {short}
                </span>
                <span className="max-w-md text-sm text-gray sm:text-right">
                  {PROOF[app.slug] ?? app.tagline}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
