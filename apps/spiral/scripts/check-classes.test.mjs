import assert from "node:assert/strict";
import { test } from "node:test";
import { audit, classesInCss, classesInSource, UNSTYLED } from "./check-classes.mjs";

test("a static class with no selector is a miss", () => {
  const used = classesInSource(
    "A.tsx",
    `export function A(){ return <div className={kind === "nope" ? "alpha beta" : "gamma"} />; }`,
  );
  const defined = classesInCss(".alpha {}\n.beta {}");
  const missing = [...used].filter((name) => !defined.has(name)).sort();
  assert.deepEqual(missing, ["gamma"]);
  assert.equal(used.has("nope"), false);
});

test("a joined class list counts, and an allowlisted hook does not", () => {
  const used = classesInSource(
    "B.tsx",
    `export function B({ className }) {
      const classes = ["btn", on ? "btn--primary" : ""].filter(Boolean).join(" ");
      return <button className={classes} />;
    }`,
  );
  assert.equal(used.has("btn"), true);
  assert.equal(used.has("btn--primary"), true);
  assert.equal(used.has("className"), false);
  const defined = classesInCss(".btn {}");
  const allow = new Set(["btn--primary"]);
  const missing = [...used].filter((name) => !defined.has(name) && !allow.has(name));
  assert.deepEqual(missing, []);
});

test("the allowlist entries that exist say why", () => {
  for (const entry of UNSTYLED) {
    assert.equal(typeof entry.name, "string");
    assert.match(entry.why, /\S/);
  }
});

test("the app source has a selector for every static class", () => {
  assert.deepEqual(audit(), []);
});
