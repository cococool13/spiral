import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import AppGrid from "@/components/AppGrid";
import OtherWork from "@/components/OtherWork";
import Footer from "@/components/Footer";
import ScrollProgress from "@/components/ScrollProgress";

export default function Home() {
  return (
    <main>
      <Nav />
      <ScrollProgress />
      <Hero />
      <AppGrid />
      <OtherWork />
      <Footer />
    </main>
  );
}
