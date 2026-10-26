import type { Metadata } from "next";
import Footer from "@/components/Footer";
import OtherWork from "@/components/OtherWork";
import PageHeader from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Other work, Spiral",
  description: "Client and studio work outside the Spiral Collection apps.",
  alternates: { canonical: "/work/" },
  openGraph: { url: "/work/" },
};

export default function WorkPage() {
  return (
    <>
      <PageHeader />
      <main id="content" className="page">
        <OtherWork />
      </main>
      <Footer />
    </>
  );
}
