import type { Metadata } from "next";
import SectionRedirect from "@/components/SectionRedirect";

export const metadata: Metadata = {
  title: "Wallpaper is part of Spiral",
  robots: { index: false, follow: true },
  alternates: { canonical: "/#wallpaper" },
};

export default function Page() {
  return (
    <SectionRedirect
      href="/#wallpaper"
      title="Wallpaper"
      sentence="Wallpaper is a section of Spiral."
    />
  );
}
