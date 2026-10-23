// Fails when a static className in apps/spiral/src/**/*.tsx has no selector
// in the app's CSS. Dynamic hooks belong in UNSTYLED, each with a reason.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "../src");

// Intentionally unstyled. Add a name only when the class is a hook, and say why.
export const UNSTYLED = [
  // { name: "example-hook", why: "read by a test, no paint" },
];

const CLASS_OPS = new Set([
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

function literals(node, sourceFile, seen) {
  if (!node) return [];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isTemplateExpression(node)) {
    const parts = [node.head.text];
    for (const span of node.templateSpans) parts.push(span.literal.text);
    return parts;
  }
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return literals(node.expression, sourceFile, seen);
  }
  if (ts.isConditionalExpression(node)) {
    return [
      ...literals(node.whenTrue, sourceFile, seen),
      ...literals(node.whenFalse, sourceFile, seen),
    ];
  }
  if (ts.isBinaryExpression(node) && CLASS_OPS.has(node.operatorToken.kind)) {
    return [...literals(node.left, sourceFile, seen), ...literals(node.right, sourceFile, seen)];
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) =>
      ts.isSpreadElement(element) ? [] : literals(element, sourceFile, seen),
    );
  }
  if (ts.isCallExpression(node) || ts.isPropertyAccessExpression(node)) {
    const fromObject = literals(node.expression, sourceFile, seen);
    const fromArgs = ts.isCallExpression(node)
      ? node.arguments.flatMap((arg) => literals(arg, sourceFile, seen))
      : [];
    return [...fromObject, ...fromArgs];
  }
  if (ts.isIdentifier(node)) return fromBinding(node.text, sourceFile, seen);
  return [];
}

function fromBinding(name, sourceFile, seen) {
  if (seen.has(name)) return [];
  seen.add(name);
  const found = [];
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer
    ) {
      found.push(...literals(node.initializer, sourceFile, seen));
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

export function classesInSource(fileName, text) {
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const texts = [];
  function visit(node) {
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "className" &&
      node.initializer
    ) {
      if (ts.isStringLiteral(node.initializer)) texts.push(node.initializer.text);
      else if (ts.isJsxExpression(node.initializer)) {
        texts.push(...literals(node.initializer.expression, sourceFile, new Set()));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  const tokens = new Set();
  for (const value of texts) {
    for (const token of value.split(/\s+/)) {
      if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(token)) tokens.add(token);
    }
  }
  return tokens;
}

export function classesInCss(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found = new Set();
  const pattern = /\.([A-Za-z_][A-Za-z0-9_-]*)/g;
  for (const match of stripped.matchAll(pattern)) found.add(match[1]);
  return found;
}

function walk(dir, suffix, files = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, suffix, files);
    else if (name.endsWith(suffix)) files.push(abs);
  }
  return files;
}

export function audit(root = srcRoot) {
  const defined = new Set();
  for (const file of walk(root, ".css")) {
    for (const name of classesInCss(readFileSync(file, "utf8"))) defined.add(name);
  }
  const allow = new Set(UNSTYLED.map((entry) => entry.name));
  const missing = [];
  for (const file of walk(root, ".tsx")) {
    const used = classesInSource(file, readFileSync(file, "utf8"));
    for (const name of used) {
      if (!defined.has(name) && !allow.has(name)) {
        missing.push(`${relative(root, file)}: ${name}`);
      }
    }
  }
  missing.sort();
  return missing;
}

function main() {
  for (const entry of UNSTYLED) {
    if (!entry.why?.trim()) {
      console.error(`check-classes: allow ${entry.name} with a reason`);
      process.exit(1);
    }
  }
  const missing = audit();
  if (missing.length > 0) {
    console.error(`check-classes: no CSS rule for:\n${missing.join("\n")}`);
    process.exit(1);
  }
  console.log("check-classes: every static className has a selector");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
