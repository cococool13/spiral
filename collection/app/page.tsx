import AppGrid from "@/components/AppGrid";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import MotionProvider from "@/components/MotionProvider";
import Nav from "@/components/Nav";
import OtherWork from "@/components/OtherWork";
import ScrollProgress from "@/components/ScrollProgress";

export default function Home() {
  return (
    <MotionProvider>
      <main>
        <Nav />
        <ScrollProgress />
        <Hero />
        <AppGrid />
        <OtherWork />
        <Footer />
      </main>
    </MotionProvider>
  );
}
