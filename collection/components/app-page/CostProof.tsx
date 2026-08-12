import type { Fact } from "@/lib/appPages";

/** What the app costs to run, at the size the claim deserves.
 *
 *  Wallpaper has no screenshot worth showing — its product is other people's
 *  photographs, which are not ours to put on a page. What is ours is the
 *  measurement, and it is the actual argument for the app: it is small enough
 *  that you forget it is installed, and it stops when you close it. */
export default function CostProof({ facts }: { facts: Fact[] }) {
  return (
    <dl className="grid grid-cols-1 gap-px border border-gray/25 sm:grid-cols-2 lg:grid-cols-4">
      {facts.map((fact) => (
        <div key={fact.label} className="p-8">
          <dd className="type-display text-4xl text-paper sm:text-5xl">{fact.value}</dd>
          <dt className="type-eyebrow mt-4 text-gray">{fact.label}</dt>
        </div>
      ))}
    </dl>
  );
}
