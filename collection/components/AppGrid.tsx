import { apps } from "@/lib/apps";
import AppCard from "./AppCard";
import Reveal from "./Reveal";

export default function AppGrid() {
  return (
    <section id="apps" className="mx-auto max-w-6xl px-6 py-32 sm:py-40">
      <Reveal>
        <p className="type-eyebrow text-paper">The Collection</p>
        <h2 className="type-display mt-4 max-w-2xl text-4xl text-paper sm:text-5xl">
          One job each. Free, always.
        </h2>
        <p className="mt-6 max-w-xl text-gray">
          Every Spiral app is a small native tool that does one thing, states
          everything it does, and quits when you close it.
        </p>
      </Reveal>
      <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app, i) => (
          <Reveal
            key={app.slug}
            delay={i * 0.05}
            className={app.status === "live" ? "sm:col-span-2 flex" : "flex"}
          >
            <AppCard app={app} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
