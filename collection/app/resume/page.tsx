import type { Metadata } from "next";
import SectionRedirect from "@/components/SectionRedirect";

export const metadata: Metadata = {
  title: "Resume is part of Spiral",
  robots: { index: false, follow: true },
  alternates: { canonical: "/#resume" },
};

export default function Page() {
  return (
    <SectionRedirect
      href="/#resume"
      title="Resume"
      sentence="Resume is a section of Spiral."
    />
  );
}
