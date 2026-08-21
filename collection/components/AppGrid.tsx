import { apps } from "@/lib/apps";
import AppCard from "./AppCard";

/** Wallpaper leads. It is the shipped product. The rest sit under it. */
const lead = apps.find((app) => app.slug === "wallpaper");
const rest = apps.filter(
  (app) => app.slug !== "wallpaper" && (app.downloads || app.source || app.page),
);

export default function AppGrid() {
  return (
    <section id="apps" className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
      <h2 className="type-display max-w-2xl text-4xl text-paper sm:text-5xl">
        One job each. Free, always.
      </h2>
      <p className="mt-6 max-w-xl text-gray">
        Every Spiral app is a small native tool that does one thing, states everything it
        does, and quits when you close it.
      </p>
      {lead ? (
        <div className="mt-14">
          <AppCard app={lead} featured />
        </div>
      ) : null}
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((app) => (
          <div key={app.slug} className="flex">
            <AppCard app={app} />
          </div>
        ))}
      </div>
    </section>
  );
}
