import type { Metadata } from "next";
import AppPageLayout from "@/components/app-page/AppPageLayout";
import HeroProof from "@/components/app-page/HeroProof";
import RemovalRules from "@/components/app-page/RemovalRules";
import { appPage } from "@/lib/appPages";

const page = appPage("clean");

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  openGraph: { title: page.title, description: page.description, type: "website" },
};

export default function CleanPage() {
  return (
    <AppPageLayout
      page={page}
      afterHero={
        <HeroProof
          heading="Three verdicts, decided before you run it."
          note="A cleaner's screenshot tells you nothing about whether to trust it. The rule governing permanent deletion tells you everything."
        >
          <RemovalRules />
        </HeroProof>
      }
    />
  );
}
