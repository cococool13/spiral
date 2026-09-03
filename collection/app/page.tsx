import AppIndex from "@/components/AppIndex";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import Manifesto from "@/components/Manifesto";
import Nav from "@/components/Nav";
import Rules from "@/components/Rules";

export default function Home() {
  // Nav and Footer sit outside <main>. Nested inside it they were generic
  // divs, not banner and contentinfo landmarks — so the page had no site
  // chrome to jump to, and <main> claimed the header and footer as content.
  return (
    <>
      <Nav />
      <main id="content">
        <Hero />
        <AppIndex />
        <Rules />
        <Manifesto />
      </main>
      <Footer />
    </>
  );
}
