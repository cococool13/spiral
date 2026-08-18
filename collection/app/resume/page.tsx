import type { Metadata } from "next";
import AppPageLayout from "@/components/app-page/AppPageLayout";
import TemplateSequence from "@/components/resume/TemplateSequence";
import { appPage } from "@/lib/appPages";

const page = appPage("resume");

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  openGraph: { title: page.title, description: page.description, type: "website" },
};

/** The one claim on this page that is worth showing rather than stating: two
 *  rewrites that came back from a model, and what happened to each. */
function FactGate() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-32 sm:py-40">
      <h2 className="type-display max-w-2xl text-4xl text-paper sm:text-5xl">
        What a rewrite is allowed to change.
      </h2>
      <p className="mt-6 max-w-xl text-gray">
        Both of these came back from a model. One reached the page. The other was
        discarded before it got near the document.
      </p>
      <div className="mt-16 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <article className="h-full border border-gray/25 p-8">
          <p className="type-eyebrow text-paper">Kept</p>
          <p className="mt-6 text-sm text-gray">You wrote</p>
          <p className="mt-2 text-paper">
            Was responsible for managing a team of 6 engineers at Admiralty over 18 months
          </p>
          <p className="mt-6 text-sm text-gray">It came back as</p>
          <p className="mt-2 text-paper">
            Managed a team of 6 engineers at Admiralty over 18 months
          </p>
          <p className="mt-6 text-sm text-gray">
            Same 6, same Admiralty, same 18 months. The filler is gone.
          </p>
        </article>
        <article className="h-full border border-red/40 p-8">
          <p className="type-eyebrow text-paper">Discarded</p>
          <p className="mt-6 text-sm text-gray">You wrote</p>
          <p className="mt-2 text-paper">Managed 6 engineers over 18 months</p>
          <p className="mt-6 text-sm text-gray">It came back as</p>
          <p className="mt-2 text-paper">Managed 18 engineers over 6 months</p>
          <p className="mt-6 text-sm text-gray">
            Both numbers are still there, so a careless check passes it. It says you
            managed three times the people for a third of the time, so this one does not.
          </p>
        </article>
      </div>
    </section>
  );
}

export default function ResumePage() {
  return (
    <AppPageLayout page={page} afterHero={<TemplateSequence />} proof={<FactGate />} />
  );
}
