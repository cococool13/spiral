// Runs the native smoke test and exits non-zero when it fails.
//
// `tauri dev` does not forward the app's exit code: smoke.rs calls
// `app.exit(1)` on failure, but the CLI still returns 0, so a failed smoke
// reported success to the shell. The Definition of Done names this run as a
// release gate, and a gate that cannot fail is not a gate — CI or a human
// checking `$?` saw a pass on a broken pipeline.
//
// So the verdict comes from the SMOKE lines themselves rather than the exit
// code. Absence of a verdict is a failure, not a pass: a crash, a hang killed
// by the caller, or a build error must never look like success.
import { spawn } from "node:child_process";

const OK = "SMOKE OK";
const FAIL = "SMOKE FAIL";
const WARN = "SMOKE WARN";

const child = spawn("pnpm", ["tauri", "dev"], {
  env: { ...process.env, SPIRAL_SMOKE: "1" },
  stdio: ["inherit", "pipe", "pipe"],
});

let sawOk = false;
let failLine = "";
const warnings = [];

/** Tee the stream through so the run stays watchable, and read the verdict. */
function watch(stream, sink) {
  let buffered = "";
  stream.on("data", (chunk) => {
    sink.write(chunk);
    buffered += chunk.toString();
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (line.includes(OK)) sawOk = true;
      else if (line.includes(FAIL)) failLine = line.trim();
      else if (line.includes(WARN)) warnings.push(line.trim());
    }
  });
}

watch(child.stdout, process.stdout);
watch(child.stderr, process.stderr);

child.on("close", (code, signal) => {
  const verdict = failLine ? "fail" : sawOk ? "pass" : "inconclusive";

  if (warnings.length > 0) {
    process.stderr.write(`\n${warnings.join("\n")}\n`);
  }

  if (verdict === "pass") {
    process.stderr.write("\nsmoke: passed\n");
    process.exit(0);
  }

  if (verdict === "fail") {
    process.stderr.write(`\nsmoke: FAILED — ${failLine}\n`);
    process.exit(1);
  }

  process.stderr.write(
    `\nsmoke: FAILED — the run ended without printing "${OK}" or "${FAIL}" ` +
      `(tauri exit code ${code}, signal ${signal ?? "none"}). ` +
      "Treating a missing verdict as a failure.\n",
  );
  process.exit(1);
});

child.on("error", (error) => {
  process.stderr.write(`\nsmoke: FAILED — could not start tauri dev: ${error.message}\n`);
  process.exit(1);
});
