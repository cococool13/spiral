"use client";

import { useState } from "react";
import { SLIM_POLICIES } from "@/lib/slimPolicies";

/** Every policy the Brave Maximum Privacy preset sets, by its real name.
 *
 *  The argument of Slim's page is that it shows you the changes before it makes
 *  them, so the page can show them too. Default: collapsed to a count; expand
 *  to read the full wall. */
export default function PolicyWall() {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-gray/25 p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="font-mono text-xs text-paper">
          {SLIM_POLICIES.length} policies · Brave · Maximum Privacy preset
        </p>
        <button
          type="button"
          className="font-mono text-xs text-gray underline decoration-gray/40 underline-offset-4 hover:text-paper hover:decoration-paper/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide list" : "Show every policy"}
        </button>
      </div>
      {open ? (
        <ul className="mt-8 grid grid-cols-1 gap-x-8 gap-y-2 border-t border-gray/25 pt-6 font-mono text-xs text-gray sm:grid-cols-2 lg:grid-cols-3">
          {SLIM_POLICIES.map((policy) => (
            <li key={policy} className="[overflow-wrap:anywhere]">
              {policy}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 max-w-xl text-sm text-gray">
          Slim shows each change before it writes. Expand to see the same list the app
          reviews.
        </p>
      )}
    </div>
  );
}
