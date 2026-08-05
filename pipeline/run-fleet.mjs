#!/usr/bin/env node
// Resolution Network -- the fleet runner.
// One invocation = one research session for every active Resolver, run
// sequentially with spacing between sessions (the server-side web tool
// rate limit punishes parallel fleets) and one retry per Resolver.
//
// Usage:
//   node pipeline/run-fleet.mjs [--dry]
//   RESOLVER_SPACING_MS   gap between sessions (default 180000 = 3 min)
//   RESOLVER_RETRY_MS     wait before a retry     (default 300000 = 5 min)
//
// Exit code 0 only if every active Resolver completed; 1 otherwise, so a
// supervising job can alert. Partial fleets still publish their work: each
// session commits its own artifacts and re-renders the site data as it ends.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LABS = path.resolve(HERE, "..");
const REGISTRY = JSON.parse(fs.readFileSync(path.join(LABS, "resolvers/registry.json"), "utf8"));

const DRY = process.argv.includes("--dry");
const SPACING_MS = Number(process.env.RESOLVER_SPACING_MS || 180000);
const RETRY_MS = Number(process.env.RESOLVER_RETRY_MS || 300000);

const fleet = REGISTRY.resolvers.filter((r) => r.status !== "queued");
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function runOnce(id) {
  try {
    execFileSync(process.execPath, [path.join(HERE, "run-resolver.mjs"), id, ...(DRY ? ["--dry"] : [])], {
      stdio: "inherit",
      timeout: 30 * 60 * 1000,
    });
    return true;
  } catch {
    return false;
  }
}

const results = [];
for (let i = 0; i < fleet.length; i++) {
  const r = fleet[i];
  console.log(`\n=== ${r.name} (${i + 1}/${fleet.length}) ===`);
  let ok = runOnce(r.id);
  if (!ok && !DRY) {
    console.log(`${r.name} failed; retrying in ${RETRY_MS / 60000} min.`);
    await sleep(RETRY_MS);
    ok = runOnce(r.id);
  }
  results.push({ id: r.id, name: r.name, ok });
  if (i < fleet.length - 1 && !DRY) await sleep(SPACING_MS);
}

const failed = results.filter((r) => !r.ok);
console.log(`\nFleet run complete: ${results.length - failed.length}/${results.length} sessions succeeded.`);
if (failed.length) {
  console.error(`Failed after retry: ${failed.map((f) => f.name).join(", ")}`);
  process.exit(1);
}
