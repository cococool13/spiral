import AppGrid from "@/components/AppGrid";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import Nav from "@/components/Nav";
import OtherWork from "@/components/OtherWork";

const pillars = [
  {
    title: "Privacy",
    body: "No accounts. No telemetry. The only network calls are the ones you ask for.",
  },
  {
    title: "Ease of use",
    body: "One window, one job. Click, done. Nothing to configure before it works.",
  },
  {
    title: "Lightweight",
    body: "Native binaries a few megabytes each. Close the window and nothing keeps running.",
  },
];

export default function Home() {
  // Nav and Footer sit outside <main>. Nested inside it they were generic
  // divs, not banner and contentinfo landmarks — so the page had no site
  // chrome to jump to, and <main> claimed the header and footer as content.
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <section className="border-t border-white/10">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 sm:grid-cols-3">
            {pillars.map((p) => (
              <div key={p.title}>
                <h2 className="type-eyebrow text-paper">{p.title}</h2>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-gray">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </section>
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
