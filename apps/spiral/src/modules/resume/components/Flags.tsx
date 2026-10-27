import { useEffect, useState } from "react";
import { checkResume, type Finding } from "../api";
import type { ResumeDoc } from "../lib/types";
import { useDebounced } from "../lib/useDebounced";

interface Flag {
  key: string;
  text: string;
  fix?: { label: string; run: () => void };
}

/** Moves focus to the field that needs the person. Never edits it for them:
 *  a fix that typed a value would be Spiral writing a fact. */
function focusField(match: (input: HTMLInputElement | HTMLTextAreaElement, label: string) => boolean) {
  const fields = document.querySelectorAll<HTMLLabelElement>(".editor__fields .field");
  for (const field of Array.from(fields)) {
    const input = field.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    const label = field.querySelector("span")?.textContent ?? "";
    if (input && match(input, label)) {
      input.scrollIntoView({ block: "center" });
      input.focus();
      input.select();
      return;
    }
  }
}

const CONTACT: Record<string, { label: string; ask: string }> = {
  name: { label: "Name", ask: "No name was found." },
  email: { label: "Email", ask: "No email was found." },
  phone: { label: "Phone", ask: "No phone number was found." },
  location: { label: "Location", ask: "No location was found." },
};

export function toFlag(finding: Finding, index: number): Flag {
  switch (finding.type) {
    case "missingContact": {
      const field = CONTACT[finding.field ?? "name"] ?? CONTACT.name;
      return {
        key: `contact-${finding.field}`,
        text: field.ask,
        fix: { label: `Add ${field.label.toLowerCase()}`, run: () => focusField((_, label) => label === field.label) },
      };
    }
    case "unparsedDate":
      return {
        key: `date-${finding.raw}-${index}`,
        text: `“${finding.raw}” has no year Spiral could read.`,
        fix: {
          label: "Write the year",
          run: () => focusField((input) => input.value.trim() === (finding.raw ?? "").trim()),
        },
      };
    case "unknownHeading":
      return {
        key: `heading-${finding.raw}-${index}`,
        text: `“${finding.raw}” is not a heading Spiral knows. Its lines stay as text.`,
      };
    case "hiddenText":
      return {
        key: `hidden-${finding.page}-${index}`,
        text: `Page ${finding.page ?? 1} of the original has hidden text${finding.sample ? `: “${finding.sample}”` : ""}. Delete it in the source file.`,
      };
  }
}

/** Parse flags before export, each with the one click that helps. */
export function Flags({ doc, text }: { doc: ResumeDoc; text: string }) {
  const settled = useDebounced(doc, 600);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void checkResume(settled, text)
      .then((reply) => {
        if (!live) return;
        setFindings(reply.findings);
        setError("");
      })
      .catch((err: unknown) => {
        if (live) setError(`The check did not run: ${err instanceof Error ? err.message : String(err)}`);
      });
    return () => {
      live = false;
    };
  }, [settled, text]);

  if (error) return <p className="flags flags--quiet">{error}</p>;
  if (findings === null) return <p className="flags flags--quiet">Checking the parse.</p>;
  if (findings.length === 0) return <p className="flags flags--quiet">No parse flags. Ready to export.</p>;
  return (
    <ul className="flags" aria-label="Parse flags">
      {findings.map(toFlag).map((flag) => (
        <li className="flag" key={flag.key}>
          <span>{flag.text}</span>
          {flag.fix ? (
            <button type="button" className="flag__fix" onClick={flag.fix.run}>
              {flag.fix.label}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
