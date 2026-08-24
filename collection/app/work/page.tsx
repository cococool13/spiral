import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import OtherWork from "@/components/OtherWork";

export const metadata: Metadata = {
  title: "Other work — Spiral",
  description: "Client and studio work outside the Spiral Collection apps.",
};

export default function WorkPage() {
  return (
    <>
      <Nav />
      <main id="content" className="pt-8">
        <OtherWork />
      </main>
      <Footer />
    </>
  );
}
