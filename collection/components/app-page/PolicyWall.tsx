"use client";

import { m, useReducedMotion } from "framer-motion";
import { SLIM_POLICIES } from "@/lib/slimPolicies";

/** Every policy the Brave Maximum Privacy preset sets, by its real name.
 *
 *  The argument of Slim's page is that it shows you the changes before it makes
 *  them, so the page shows them too. Fifty-four identifiers is a lot to read,
 *  and that is the point: it is the size of what a browser turns on by default. */
export default function PolicyWall() {
  const reduced = useReducedMotion();

  return (
    <div className="border border-gray/25 p-6 sm:p-8">
      <ul className="grid grid-cols-1 gap-x-8 gap-y-2 font-mono text-xs text-gray sm:grid-cols-2 lg:grid-cols-3">
        {SLIM_POLICIES.map((policy, i) =>
          reduced ? (
            <li key={policy} className="[overflow-wrap:anywhere]">
              {policy}
            </li>
          ) : (
            <m.li
              key={policy}
              className="[overflow-wrap:anywhere]"
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              // Staggered across the whole wall rather than per row, so it
              // fills in like a list being written out.
              transition={{
                duration: 0.5,
                delay: Math.min(i * 0.012, 0.7),
                ease: [0.32, 0.72, 0, 1],
              }}
            >
              {policy}
            </m.li>
          ),
        )}
      </ul>
      <p className="mt-8 border-t border-gray/25 pt-6 font-mono text-xs text-paper">
        {SLIM_POLICIES.length} policies · Brave · Maximum Privacy preset
      </p>
    </div>
  );
}
