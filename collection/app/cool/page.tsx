import type { Metadata } from "next";
import CoolJourney from "@/components/cool/CoolJourney";
import MotionProvider from "@/components/MotionProvider";
import Nav from "@/components/Nav";
import "./cool.css";

export const metadata: Metadata = {
  title: "Cool — Spiral",
  description:
    "A scroll-driven WebGL corridor. Eight chambers, one continuous tunnel, and the whole spectrum. Built with the same tokens as the rest of the site.",
  openGraph: {
    title: "Cool — Spiral",
    description:
      "A scroll-driven WebGL corridor. Eight chambers, one continuous tunnel, and the whole spectrum.",
    type: "website",
  },
};

export default function CoolPage() {
  return (
    <MotionProvider>
      <Nav />
      <CoolJourney />
    </MotionProvider>
  );
}
