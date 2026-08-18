import AppGrid from "@/components/AppGrid";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import Nav from "@/components/Nav";
import OtherWork from "@/components/OtherWork";

export default function Home() {
  // Nav and Footer sit outside <main>. Nested inside it they were generic
  // divs, not banner and contentinfo landmarks — so the page had no site
  // chrome to jump to, and <main> claimed the header and footer as content.
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <section className="mx-auto max-w-4xl px-6 py-24 sm:py-32">
          <p className="type-display text-4xl text-paper sm:text-5xl">
            <span className="block">Every one of these could have</span>
            <span className="block">an account, a subscription</span>
            <span className="block">and a process that never stops.</span>
            <span className="block">None of them do.</span>
          </p>
        </section>
        <AppGrid />
        <OtherWork />
      </main>
      <Footer />
    </>
  );
}
