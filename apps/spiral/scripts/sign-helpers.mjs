import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entitlements = join(here, "..", "src-tauri", "entitlements");

export const bundleConfig = "src-tauri/tauri.bundle.conf.json";
export const emptyEntitlements = join(entitlements, "empty.plist");
export const llamaEntitlements = join(entitlements, "llama-server.plist");

const JIT = [
  "com.apple.security.cs.allow-jit",
  "com.apple.security.cs.allow-unsigned-executable-memory",
  "com.apple.security.cs.disable-library-validation",
];

const HELPERS = ["spiral-wallpaper", "spiral-resume-engine", "llama-server"];

export function tauriBuildArgs(argv) {
  const args = [...argv];
  const buildEngine = args[0] === "build";
  if (buildEngine && !args.includes("--config")) {
    args.push("--config", bundleConfig);
  }
  return { buildEngine, args };
}

export function missingHelpers(app) {
  const mac = join(app, "Contents", "MacOS");
  return HELPERS.filter((name) => !existsSync(join(mac, name)));
}

export function signFile(file, plist, identity, { timestamp = true } = {}) {
  const args = ["--force", "--options", "runtime", "--sign", identity];
  if (timestamp) {
    args.push("--timestamp");
  }
  args.push("--entitlements", plist, file);
  execFileSync("codesign", args, { stdio: "pipe" });
}

export function entitlementKeys(file) {
  let xml = "";
  try {
    xml = execFileSync("codesign", ["-d", "--entitlements", ":-", file], {
      encoding: "utf8",
    });
  } catch (err) {
    xml = `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
  return [...xml.matchAll(/<key>([^<]+)<\/key>/g)].map((match) => match[1]);
}

export function assertHelperEntitlements(app) {
  const mac = join(app, "Contents", "MacOS");
  for (const name of ["spiral-wallpaper", "spiral-resume-engine"]) {
    const keys = entitlementKeys(join(mac, name));
    const hit = keys.filter((key) => JIT.includes(key));
    if (hit.length !== 0) {
      throw new Error(`${name} has ${hit.join(", ")}`);
    }
  }
  const llama = entitlementKeys(join(mac, "llama-server"));
  const extra = llama.filter((key) => !JIT.includes(key));
  const missing = JIT.filter((key) => !llama.includes(key));
  if (extra.length !== 0 || missing.length !== 0) {
    throw new Error(
      `llama-server entitlements are ${llama.join(", ") || "empty"}`,
    );
  }
}

export function signHelpers(app, identity, options = {}) {
  const missing = missingHelpers(app);
  if (missing.length !== 0) {
    throw new Error(`missing ${missing.join(", ")}`);
  }
  const mac = join(app, "Contents", "MacOS");
  signFile(join(mac, "spiral-wallpaper"), emptyEntitlements, identity, options);
  signFile(
    join(mac, "spiral-resume-engine"),
    emptyEntitlements,
    identity,
    options,
  );
  signFile(join(mac, "llama-server"), llamaEntitlements, identity, options);
  signFile(
    join(mac, "spiral-resume-engine"),
    emptyEntitlements,
    identity,
    options,
  );
  signFile(join(mac, "spiral-wallpaper"), emptyEntitlements, identity, options);
  assertHelperEntitlements(app);
}

export function signBundle(app, identity, options = {}) {
  signFile(app, emptyEntitlements, identity, options);
}

const invoked =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invoked) {
  const app = process.argv[2];
  const identity = process.env.APPLE_SIGNING_IDENTITY;
  if (!app || !identity) {
    process.stderr.write(
      "usage: APPLE_SIGNING_IDENTITY=... node scripts/sign-helpers.mjs <App.app>\n",
    );
    process.exit(1);
  }
  signHelpers(app, identity);
  signBundle(app, identity);
  assertHelperEntitlements(app);
}
