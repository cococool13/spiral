import type { Metadata } from "next";
import SectionRedirect from "@/components/SectionRedirect";

export const metadata: Metadata = {
  title: "Spiral",
  robots: { index: false, follow: true },
  alternates: { canonical: "/" },
};

export default function Page() {
  return <SectionRedirect href="/" title="Spiral" sentence="Spiral is the app." />;
}
