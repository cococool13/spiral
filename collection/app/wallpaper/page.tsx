import type { Metadata } from "next";
import AppPageLayout from "@/components/app-page/AppPageLayout";
import CostProof from "@/components/app-page/CostProof";
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
          eyebrow="What it costs to run"
          heading="Measured, not estimated."
          note="From the app's own README, taken on Apple silicon. The last one is not a measurement but a promise: closing the window ends the process."
        >
          <CostProof facts={page.facts ?? []} />
        </HeroProof>
      }
    />
  );
}
