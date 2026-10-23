import type { ReactNode } from "react";
import { apps } from "@/lib/apps";
import Mark from "./Mark";

const EMAIL = "cohenbcoolidge@gmail.com";
const GITHUB = "https://github.com/cococool13";
const year = 2026;

const sections = apps[0].sections;

/** Product index and ownership details, followed by the collection signature. */
export default function Footer() {
  return (
    <footer className="close">
      <div className="close-shell">
        <div className="close-cols">
          <Col title="Spiral">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`/#${section.id}`} className="close-link">
                  {section.name}
                </a>
              </li>
            ))}
          </Col>
          <Col title="Contact">
            <li>
              <a href={`mailto:${EMAIL}`} className="close-link">
                {EMAIL}
              </a>
            </li>
            <li>
              <a
                href={GITHUB}
                target="_blank"
                rel="noopener noreferrer"
                className="close-link"
              >
                GitHub
              </a>
            </li>
          </Col>
          <Col title="Site">
            <li>
              <a href="/thanks/" className="close-link">
                After you pay
              </a>
            </li>
            <li>
              <a href="/privacy/" className="close-link">
                Privacy
              </a>
            </li>
            <li>
              <a href="/work/" className="close-link">
                Other work
              </a>
            </li>
            <li>
              <a
                href="https://github.com/cococool13/spiral/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="close-link"
              >
                MIT licence
              </a>
            </li>
            <li>
              <a
                href="https://unsplash.com/photos/E_kMaBHrw0k"
                target="_blank"
                rel="noopener noreferrer"
                className="close-link"
              >
                Photograph
              </a>
            </li>
          </Col>
          <p className="close-copyright obs-readout">© {year} Cohen Coolidge</p>
        </div>
      </div>

      <div className="close-signature shell" aria-hidden="true">
        <span>Spiral.</span>
        <Mark size={112} />
      </div>
    </footer>
  );
}

function Col({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="obs-readout close-col-title">{title}</p>
      <ul className="close-list">{children}</ul>
    </div>
  );
}
