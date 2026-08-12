/** What Spiral Clean may do to a file, and how it decides.
 *
 *  This is the product. A cleaner's screenshot tells you nothing about whether
 *  to trust it; the rule that governs permanent deletion tells you everything,
 *  so the rule is what the page shows. The wording follows `apps/clean/CONTEXT.md`
 *  — these are the app's own defined terms, not a marketing paraphrase. */
const RULES = [
  {
    verdict: "Deleted for good",
    tone: "red" as const,
    what: "Only what is in the safe-category catalogue",
    detail:
      "A fixed list shipped with the release, holding clearly regenerable files. Membership never comes from looking at a file — it is decided before you run the app.",
  },
  {
    verdict: "Moved to the Trash",
    tone: "paper" as const,
    what: "Everything else it removes",
    detail:
      "App-managed state, orphaned leftovers, caches outside the catalogue. Recoverable, so a mistake costs you a restore rather than a file.",
  },
  {
    verdict: "Never touched",
    tone: "gray" as const,
    what: "Anything you made",
    detail:
      "User-created content is never searched for, suggested, or removed — even during an uninstall, and even when its name matches the app exactly.",
  },
];

export default function RemovalRules() {
  return (
    <ol className="grid grid-cols-1 gap-px border border-gray/25 lg:grid-cols-3">
      {RULES.map((rule) => (
        <li key={rule.verdict} className="p-8">
          <p
            className={`type-heading text-xl ${
              rule.tone === "red"
                ? "text-red"
                : rule.tone === "paper"
                  ? "text-paper"
                  : "text-gray"
            }`}
          >
            {rule.verdict}
          </p>
          <p className="mt-4 font-mono text-xs uppercase tracking-widest text-gray">
            {rule.what}
          </p>
          <p className="mt-4 text-gray">{rule.detail}</p>
        </li>
      ))}
    </ol>
  );
}
