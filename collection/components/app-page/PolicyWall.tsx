import type { CSSProperties } from "react";
import { SLIM_POLICIES } from "@/lib/slimPolicies";

/** Every policy the Brave Maximum Privacy preset sets, by its real name.
 *
 *  The argument of Slim's page is that it shows you the changes before it makes
 *  them, so the page shows them too. Fifty-four identifiers is a lot to read,
 *  and that is the point: it is the size of what a browser turns on by default.
 *
 *  Which is exactly why the list is plain HTML with a CSS entrance rather than
 *  54 framer subscriptions: every name used to ship as `opacity: 0`, so the one
 *  piece of evidence the page rests on was the one piece that needed script to
 *  appear. It fills in on scroll where the browser supports it, and is simply
 *  there where it does not. */
export default function PolicyWall() {
  return (
    <div className="border border-gray/25 p-6 sm:p-8">
      <ul className="grid grid-cols-1 gap-x-8 gap-y-2 font-mono text-xs text-gray sm:grid-cols-2 lg:grid-cols-3">
        {SLIM_POLICIES.map((policy, i) => (
          <li
            key={policy}
            className="reveal [overflow-wrap:anywhere]"
            // Staggered across the whole wall rather than per row, so it fills
            // in like a list being written out. A tight spread and a short lift
            // because there are 54 of them and each is one line high.
            style={
              {
                "--reveal-step": i,
                "--reveal-spread": "0.7%",
                "--reveal-lift": "6px",
              } as CSSProperties
            }
          >
            {policy}
          </li>
        ))}
      </ul>
      <p className="mt-8 border-t border-gray/25 pt-6 font-mono text-xs text-paper">
        {SLIM_POLICIES.length} policies · Brave · Maximum Privacy preset
      </p>
    </div>
  );
}
