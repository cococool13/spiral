import { useEffect, useState } from "react";
import { Button } from "../../../ui/Button";
import { checkResume, type Finding } from "../api";
import type { ResumeDoc } from "../lib/types";
import { Notice } from "../components/Notice";

function sentence(finding: Finding): string {
  switch (finding.type) {
    case "hiddenText":
      return `Page ${finding.page ?? 1} has hidden text. Select it in the source and delete it. Sample: ${finding.sample ?? ""}`.trim();
    case "unknownHeading":
      return `${finding.raw} is not a heading Spiral knows. Rename it to a standard heading, or leave it as a line of text.`;
    case "unparsedDate":
      return `${finding.raw} has no year Spiral could read. Write the year.`;
    case "missingContact":
      if (finding.field === "email") return "Add an email.";
      if (finding.field === "phone") return "Add a phone number.";
      if (finding.field === "location") return "Add a location.";
      return "Add a name.";
  }
}

export function Check({
  doc,
  text,
  onContinue,
}: {
  doc: ResumeDoc;
  text: string;
  onContinue: () => void;
}) {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setFindings(null);
    setError("");
    void checkResume(doc, text)
      .then((reply) => {
        if (live) setFindings(reply.findings);
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      live = false;
    };
  }, [doc, text]);

  return (
    <section className="panel">
      <h2 className="panel__title">Check</h2>
      {error ? <Notice tone="warn">{error}</Notice> : null}
      {findings && findings.length === 0 ? <Notice>No problems found.</Notice> : null}
      {findings && findings.length > 0 ? (
        <ul className="findings">
          {findings.map((finding) => (
            <li key={sentence(finding)}>{sentence(finding)}</li>
          ))}
        </ul>
      ) : null}
      {findings === null && !error ? <p className="panel__lede">Reading the resume.</p> : null}
      <div className="panel__actions panel__actions--dock">
        <Button variant="primary" onClick={onContinue}>
          Continue
        </Button>
      </div>
    </section>
  );
}
