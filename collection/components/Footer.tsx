import type { ReactNode } from "react";
import { apps } from "@/lib/apps";
import Mark from "./Mark";

const EMAIL = "cohencool@icloud.com";
const GITHUB = "https://github.com/cococool13";
const year = 2026;

const appLinks = apps.filter((a) => a.page);

/**
 * The close. Three short columns, then the mark at monumental scale — three paper bands cropped by the bottom of the page. One
 * colour, filled, never rotated; only bigger than anywhere else.
 */
export default function Footer() {
  return (
    <footer className="close">
      <div className="close-shell">
        <div className="close-cols">
          <Col title="Apps">
            {appLinks.map((app) =>
              app.page ? (
                <li key={app.slug}>
                  <a href={app.page} className="close-link">
                    {app.name.replace("Spiral ", "")}
                  </a>
                </li>
              ) : null,
            )}
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

      <div className="close-mark" aria-hidden="true">
        <Mark size={720} className="close-glyph" />
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
