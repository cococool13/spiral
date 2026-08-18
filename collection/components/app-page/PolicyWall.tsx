import { SLIM_POLICIES } from "@/lib/slimPolicies";

/** Every policy the Brave Maximum Privacy preset sets, by its real name.
 *
 *  The argument of Slim's page is that it shows you the changes before it makes
 *  them, so the page shows them too. Fifty-four identifiers is a lot to read,
 *  and that is the point: it is the size of what a browser turns on by default. */
export default function PolicyWall() {
  return (
    <div className="border border-gray/25 p-6 sm:p-8">
      <ul className="grid grid-cols-1 gap-x-8 gap-y-2 font-mono text-xs text-gray sm:grid-cols-2 lg:grid-cols-3">
        {SLIM_POLICIES.map((policy) => (
          <li key={policy} className="[overflow-wrap:anywhere]">
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
