import type { Metadata } from "next";
import AppPageLayout from "@/components/app-page/AppPageLayout";
import HeroProof from "@/components/app-page/HeroProof";
import { appPage } from "@/lib/appPages";

const page = appPage("wallpaper");

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  openGraph: { title: page.title, description: page.description, type: "website" },
};

export default function WallpaperPage() {
  return (
    <AppPageLayout
      page={page}
      afterHero={
        <HeroProof
          heading="Measured, not estimated."
          note="From the app's own README, taken on Apple silicon. The last one is not a measurement but a promise: closing the window ends the process."
        >
          <dl className="grid grid-cols-1 gap-px border border-gray/25 sm:grid-cols-2 lg:grid-cols-4">
            {(page.facts ?? []).map((fact) => (
              <div key={fact.label} className="p-8">
                {/* Down a step at `lg`, where four columns make each cell 211px:
                    the word "second" alone sets 218px at 48px, so the longest
                    value was being cut rather than wrapped. */}
                <dd className="type-display text-4xl text-paper sm:text-5xl lg:text-4xl">
                  {fact.value}
                </dd>
                <dt className="type-eyebrow mt-4 text-gray">{fact.label}</dt>
              </div>
            ))}
          </dl>
        </HeroProof>
      }
    />
  );
}
