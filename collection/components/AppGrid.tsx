import { apps } from "@/lib/apps";
import AppCard from "./AppCard";

/** A card is for an app you can do something with — download it, build it, or
 *  read a page about it. The rest are named in one line underneath.
 *
 *  This used to be all eight, which made the grid a single decision point with
 *  eight options where six could not be acted on: four dead "Coming soon"
 *  pills and two more with nowhere to go. Naming them in a sentence is the
 *  same information, honestly weighted, and it costs a line instead of a row. */
const reachable = apps.filter((app) => app.downloads || app.source || app.page);
const rest = apps.filter((app) => !reachable.includes(app));

export default function AppGrid() {
  return (
    <section id="apps" className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <h2 className="type-display max-w-2xl text-4xl text-paper sm:text-5xl">
        One job each. Free, always.
      </h2>
      <p className="mt-6 max-w-xl text-gray">
        Every Spiral app is a small native tool that does one thing, states everything it
        does, and quits when you close it.
      </p>
      <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {reachable.map((app) => (
          <div key={app.slug} className="flex">
            <AppCard app={app} />
          </div>
        ))}
      </div>
      {rest.length > 0 && (
        <p className="mt-10 max-w-2xl border-t border-white/10 pt-8 text-sm text-gray">
          {rest.length} more are being built —{" "}
          <span className="text-concrete">
            {rest.map((app) => app.name.replace("Spiral ", "")).join(", ")}
          </span>
          . None of them have a date, and there is nothing to sign up to.
        </p>
      )}
    </section>
  );
}
