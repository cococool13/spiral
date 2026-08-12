import AppGrid from "@/components/AppGrid";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import Showcase from "@/components/home/Showcase";
import MotionProvider from "@/components/MotionProvider";
import Nav from "@/components/Nav";
import OtherWork from "@/components/OtherWork";
import TaglineReveal from "@/components/resume/TaglineReveal";
import ScrollProgress from "@/components/ScrollProgress";

export default function Home() {
  // Nav and Footer sit outside <main>. Nested inside it they were generic
  // divs, not banner and contentinfo landmarks — so the page had no site
  // chrome to jump to, and <main> claimed the header and footer as content.
  return (
    <MotionProvider>
      <Nav />
      <ScrollProgress />
      <main>
        <Hero />
        <Showcase />
        <TaglineReveal
          lines={[
            "Every one of these could have",
            "an account, a subscription",
            "and a process that never stops.",
            "None of them do.",
          ]}
        />
        <AppGrid />
        <OtherWork />
      </main>
      <Footer />
    </MotionProvider>
  );
}
