#!/usr/bin/env node
// Pins the offline model into assets/model-catalogue.json.
//
// The catalogue's `sha256` is what every future download is verified against.
// Transcribing it by hand is the one step in the release where a silent typo
// turns verification into theatre: the app would check a hash nobody has, fail
// every download, and say the file was corrupt. So the machine that computes it
// is the machine that writes it.
//
//   node scripts/pin-model.mjs <url> --id qwen3.5-4b [--name "Display name"]
//                              [--file name.gguf] [--note "One line"]
//                              [--keep /tmp/model.gguf]
//
// The catalogue holds several models — the user picks one in Settings — so a
// pin updates the entry with the given id and leaves the others alone.
//
// Downloads once, hashes the bytes as they arrive, and writes url, sha256 and
// bytes together. Nothing is kept afterwards — the app downloads its own copy
// into the user's app-data folder when they ask for it.
//
// `--keep` writes the bytes out as well, for the one job that needs the file
// rather than its hash: running the model to see whether it is any good
// (`cargo test --lib sidecar::live -- --ignored`). Without it, judging a
// candidate means downloading gigabytes twice.

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CATALOGUE = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "model-catalogue.json");

function argument(flag) {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
}

const url = process.argv[2];
if (!url || url.startsWith("--")) {
  console.error("usage: node scripts/pin-model.mjs <url> [--file name.gguf] [--name \"Display name\"]");
  process.exit(2);
}

const response = await fetch(url, { redirect: "follow" });
if (!response.ok) {
  console.error(`pin-model: ${url} returned ${response.status}. Nothing was written.`);
  process.exit(1);
}
if (!response.body) {
  console.error("pin-model: that response carried no body. Nothing was written.");
  process.exit(1);
}

const hash = createHash("sha256");
const keep = argument("--keep");
const sink = keep ? createWriteStream(keep) : undefined;
let bytes = 0;
let announced = -1;
const total = Number(response.headers.get("content-length")) || 0;

for await (const chunk of response.body) {
  hash.update(chunk);
  sink?.write(chunk);
  bytes += chunk.length;
  const percent = total ? Math.floor((bytes / total) * 100) : -1;
  if (percent !== announced && percent % 5 === 0) {
    announced = percent;
    process.stderr.write(`\rpin-model: ${percent}%`);
  }
}
process.stderr.write("\r");
if (sink) {
  await new Promise((done, fail) => sink.end((error) => (error ? fail(error) : done())));
  console.log(`pin-model: kept the bytes at ${keep}`);
}

const catalogue = JSON.parse(await readFile(CATALOGUE, "utf8"));
const id = argument("--id");
const at = catalogue.models.findIndex((model) => model.id === id);
if (at === -1) {
  console.error(
    `pin-model: no model with id ${JSON.stringify(id)} in the catalogue. ` +
      `Add the entry first, or use one of: ${catalogue.models.map((m) => m.id).join(", ")}.`,
  );
  process.exit(2);
}

const pinned = {
  ...catalogue.models[at],
  name: argument("--name") ?? catalogue.models[at].name,
  note: argument("--note") ?? catalogue.models[at].note,
  file: argument("--file") ?? catalogue.models[at].file,
  url,
  sha256: hash.digest("hex"),
  bytes,
};
catalogue.models[at] = pinned;

await writeFile(CATALOGUE, `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`pin-model: pinned ${pinned.name}`);
console.log(`  file    ${pinned.file}`);
console.log(`  bytes   ${pinned.bytes.toLocaleString()}`);
console.log(`  sha256  ${pinned.sha256}`);
