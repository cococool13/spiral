import type { Metadata } from "next";
import Footer from "@/components/Footer";
import MotionProvider from "@/components/MotionProvider";
import Nav from "@/components/Nav";
import Reveal from "@/components/Reveal";
import TaglineReveal from "@/components/resume/TaglineReveal";
import TemplateSequence from "@/components/resume/TemplateSequence";
import ScrollProgress from "@/components/ScrollProgress";

const REPO = "https://github.com/cococool13/spiral";

export const metadata: Metadata = {
  title: "Spiral Resume — your resume, set properly",
  description:
    "A free desktop resume builder. Twelve typeset layouts, PDF and Word from one source, and a model that is never allowed to change a fact.",
  openGraph: {
    title: "Spiral Resume — your resume, set properly",
    description:
      "Twelve typeset layouts, PDF and Word from one source, and a model that is never allowed to change a fact.",
    type: "website",
  },
};

const BENEFITS = [
  {
    title: "It never invents a fact",
    body: "Every number, employer, date and acronym in a rewrite is checked against what you wrote. One that moved is thrown away and your own wording is kept. The app tells you when that happens.",
  },
  {
    title: "Twelve layouts, all of them yours",
    body: "Every card on the style screen is your resume, typeset. Not a sample with someone else's name on it, and not a picture of a template.",
  },
  {
    title: "PDF and Word from one source",
    body: "Both come out of the same document in metrically matched faces, so the Word file breaks its lines where the PDF breaks them.",
  },
  {
    title: "Three engines, one promise",
    body: "Free rules, your own API key, or a 2.7 GB model that runs on your machine and never opens a connection. The free one does the job.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Bring what you have",
    body: "Paste it, or drop a PDF or Word file onto the window. Nothing is uploaded; the file is read on your computer.",
  },
  {
    n: "02",
    title: "Check what we read",
    body: "Every field it found is editable before anything is built, because a parser that guessed wrong should cost you a keystroke, not an interview.",
  },
  {
    n: "03",
    title: "Pick a style and save it",
    body: "Twelve layouts, one accent colour, PDF or Word. About a second from picking to a file on your disk.",
  },
];

const FAQ = [
  {
    q: "Is the free version limited?",
    a: "No. The free pass lays your resume out and tightens the wording by rule: it removes filler like “responsible for”, leads with a past-tense verb, and flags bullets with no number in them. Adding a key changes who rewrites the phrasing, not what you are allowed to make or export.",
  },
  {
    q: "What does “never changes a fact” actually mean?",
    a: "Before a rewritten bullet is allowed into your document, it is compared with the original. Every run of digits must still be there, in the same order, and every proper noun must still be there. A rewrite that moved one is discarded and your sentence is kept. It is a filter, not advice.",
  },
  {
    q: "Does anything I type leave my computer?",
    a: "Only if you add your own API key, and then only the bullet text, never your name, employer, dates or school. With the free pass or the offline model nothing leaves at all. There is no account, no analytics and no telemetry.",
  },
  {
    q: "How big is the offline model, and how slow is it?",
    a: "2.7 GB, downloaded once, only if you ask for it. On an Apple silicon laptop it rewrote a 64 bullet resume in about 44 seconds. An API key is faster; the rule based pass is instant.",
  },
  {
    q: "Will the Word file look like the PDF?",
    a: "The text, the order and the page count match, because both are built from the same document in metrically identical faces. Word’s spacing model is its own, so it is not pixel for pixel, and the app does not claim otherwise.",
  },
  {
    q: "Can an applicant tracking system read it?",
    a: "Yes. Every layout is real text in a normal single flow, and one of them, Sheet, is deliberately the plainest thing a parser can be handed.",
  },
  {
    q: "Why is there no account?",
    a: "Because there is nothing to sync. Your resume is one file in your own application data folder, and Settings shows you the exact path and will delete it.",
  },
  {
    q: "My old resume is two columns. Will the import work?",
    a: "Often, but a two column PDF can come out interleaved, and the app says so before you import one. That is what the Check screen is for: everything it read is editable before a single page is set.",
  },
  {
    q: "Is there a Windows build?",
    a: "Not yet. The code is cross platform and the macOS build is signed; the Windows installer has not been cut.",
  },
];

export default function ResumePage() {
  return (
    <MotionProvider>
      <Nav />
      <ScrollProgress />
      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pt-40 pb-24 sm:pt-48">
          <Reveal>
            <p className="type-eyebrow text-paper">Spiral Resume</p>
            <h1 className="type-display mt-6 max-w-[680px] text-5xl text-paper sm:text-7xl">
              Your resume,
              <br />
              set properly.
            </h1>
            <p className="mt-8 max-w-[680px] text-lg text-gray">
              Twelve typeset layouts. Your words, your facts, your file — PDF or Word, on
              your computer in about a second.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href={`${REPO}/releases`}
                className="glass-pill inline-flex items-center rounded-full px-3 py-2 text-base font-semibold text-black transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-[1.02] active:scale-[0.98]"
              >
                Watch for the first release
              </a>
              <a
                href={`${REPO}/tree/main/apps/Resume`}
                className="text-base text-gray underline-offset-4 transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-paper hover:underline"
              >
                Read the source
              </a>
            </div>
            <p className="mt-6 text-sm text-gray">
              Free. No account, no upload, no telemetry.
            </p>
          </Reveal>
        </section>

        <TemplateSequence />

        <TaglineReveal
          lines={[
            "A resume tool that rewrites",
            "your job title is not helping.",
            "This one is not allowed to.",
          ]}
        />

        {/* Benefits */}
        <section className="mx-auto max-w-6xl px-6 py-32 sm:py-40">
          <Reveal>
            <p className="type-eyebrow text-paper">What you get</p>
            <h2 className="type-display mt-4 max-w-2xl text-4xl text-paper sm:text-5xl">
              Built to be trusted with the truth.
            </h2>
          </Reveal>
          <ul className="mt-16 grid grid-cols-1 gap-12 sm:grid-cols-2">
            {BENEFITS.map((benefit, i) => (
              <Reveal key={benefit.title} delay={i * 0.05}>
                <li>
                  <h3 className="type-heading text-xl text-paper">{benefit.title}</h3>
                  <p className="mt-3 text-gray">{benefit.body}</p>
                </li>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-6 py-32 sm:py-40">
          <Reveal>
            <p className="type-eyebrow text-paper">How it works</p>
            <h2 className="type-display mt-4 max-w-2xl text-4xl text-paper sm:text-5xl">
              Three screens, then a file.
            </h2>
          </Reveal>
          <ol className="mt-16 grid grid-cols-1 gap-12 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <Reveal key={step.n} delay={i * 0.05}>
                <li>
                  <p className="font-mono text-sm text-red">{step.n}</p>
                  <h3 className="type-heading mt-4 text-xl text-paper">{step.title}</h3>
                  <p className="mt-3 text-gray">{step.body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* Proof: the gate, shown rather than claimed */}
        <section className="mx-auto max-w-6xl px-6 py-32 sm:py-40">
          <Reveal>
            <p className="type-eyebrow text-paper">The fact gate</p>
            <h2 className="type-display mt-4 max-w-2xl text-4xl text-paper sm:text-5xl">
              What a rewrite is allowed to change.
            </h2>
            <p className="mt-6 max-w-xl text-gray">
              Both of these came back from a model. One reached the page. The other was
              discarded before it got near the document.
            </p>
          </Reveal>
          <div className="mt-16 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Reveal>
              <article className="h-full border border-gray/25 p-8">
                <p className="type-eyebrow text-paper">Kept</p>
                <p className="mt-6 text-sm text-gray">You wrote</p>
                <p className="mt-2 text-paper">
                  Was responsible for managing a team of 6 engineers at Admiralty over 18
                  months
                </p>
                <p className="mt-6 text-sm text-gray">It came back as</p>
                <p className="mt-2 text-paper">
                  Managed a team of 6 engineers at Admiralty over 18 months
                </p>
                <p className="mt-6 text-sm text-gray">
                  Same 6, same Admiralty, same 18 months. The filler is gone.
                </p>
              </article>
            </Reveal>
            <Reveal delay={0.05}>
              <article className="h-full border border-red/40 p-8">
                <p className="type-eyebrow text-paper">Discarded</p>
                <p className="mt-6 text-sm text-gray">You wrote</p>
                <p className="mt-2 text-paper">Managed 6 engineers over 18 months</p>
                <p className="mt-6 text-sm text-gray">It came back as</p>
                <p className="mt-2 text-paper">Managed 18 engineers over 6 months</p>
                <p className="mt-6 text-sm text-gray">
                  Both numbers are still there, so a careless check passes it. It says you
                  managed three times the people for a third of the time, so this one does
                  not.
                </p>
              </article>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl px-6 py-32 sm:py-40">
          <Reveal>
            <p className="type-eyebrow text-paper">Questions</p>
            <h2 className="type-display mt-4 text-4xl text-paper sm:text-5xl">
              The things people ask.
            </h2>
          </Reveal>
          <dl className="mt-16">
            {FAQ.map((item, i) => (
              <Reveal key={item.q} delay={i * 0.03}>
                <div className="border-b border-gray/25 py-8">
                  <dt className="type-heading text-lg text-paper">{item.q}</dt>
                  <dd className="mt-3 text-gray">{item.a}</dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </section>

        {/* Final CTA — the same offer as the hero */}
        <section className="mx-auto max-w-6xl px-6 py-32 sm:py-40">
          <Reveal>
            <h2 className="type-display max-w-[680px] text-4xl text-paper sm:text-6xl">
              It is not out yet.
              <br />
              It will be free when it is.
            </h2>
            <p className="mt-8 max-w-xl text-gray">
              Spiral Resume is finished enough to build your resume and not finished
              enough to hand you an installer. The source is public today.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href={`${REPO}/releases`}
                className="glass-pill inline-flex items-center rounded-full px-3 py-2 text-base font-semibold text-black transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-[1.02] active:scale-[0.98]"
              >
                Watch for the first release
              </a>
              <a
                href={`${REPO}/tree/main/apps/Resume`}
                className="text-base text-gray underline-offset-4 transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-paper hover:underline"
              >
                Read the source
              </a>
            </div>
          </Reveal>
        </section>
      </main>
      <Footer />
    </MotionProvider>
  );
}
