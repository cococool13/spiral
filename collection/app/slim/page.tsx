import type { Metadata } from "next";
import AppPageLayout from "@/components/app-page/AppPageLayout";
import HeroProof from "@/components/app-page/HeroProof";
import PolicyWall from "@/components/app-page/PolicyWall";
import { appPage } from "@/lib/appPages";

const page = appPage("slim");

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  openGraph: { title: page.title, description: page.description, type: "website" },
};

export default function SlimPage() {
  return (
    <AppPageLayout
      page={page}
      afterHero={
        <HeroProof
          heading="It prints this list before it writes a thing."
          note="The real policy names from the Brave Maximum Privacy preset, read out of the file the tool ships. You approve a list you have read, not a checkbox that says harden."
        >
          <PolicyWall />
        </HeroProof>
      }
    />
  );
}
