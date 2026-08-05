#!/usr/bin/env node
// Resolution Network -- the introduction approval queue.
// Resolvers draft introductions; only a human advances them. This CLI is the
// only code path that moves a connection past "proposed".
//
// Lifecycle: proposed -> approved -> sent -> replied -> connected
//            proposed -> declined (closed)
//
// Usage:
//   node pipeline/introductions.mjs                 list the queue
//   node pipeline/introductions.mjs --show <id>     full text of one introduction
//   node pipeline/introductions.mjs --approve <id>  approve; writes a ready-to-send file to outreach/outbox/
//   node pipeline/introductions.mjs --decline <id> [--note "why"]
//   node pipeline/introductions.mjs --sent <id>     mark actually sent (after a human sent it)
//   node pipeline/introductions.mjs --replied <id> [--note "who replied, gist"]
//   node pipeline/introductions.mjs --connected <id> [--note "outcome"]
//
// Every transition appends to the connection's history and re-renders site data,
// so the public funnel moves only when a state actually changed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LABS = path.resolve(HERE, "..");
const REGISTRY = JSON.parse(fs.readFileSync(path.join(LABS, "resolvers/registry.json"), "utf8"));

const TRANSITIONS = {
  approve: { from: ["proposed"], to: "approved" },
  decline: { from: ["proposed", "approved"], to: "declined" },
  sent: { from: ["approved"], to: "sent" },
  replied: { from: ["sent"], to: "replied" },
  connected: { from: ["sent", "replied"], to: "connected" },
};

const args = process.argv.slice(2);
const flagIndex = args.findIndex((a) => a.startsWith("--") && a !== "--note");
const action = flagIndex === -1 ? "list" : args[flagIndex].slice(2);
const id = flagIndex === -1 ? null : args[flagIndex + 1];
const noteIdx = args.indexOf("--note");
const note = noteIdx !== -1 ? args[noteIdx + 1] : null;

const readJsonl = (p) =>
  fs.existsSync(p)
    ? fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l))
    : [];

const domains = REGISTRY.resolvers.filter((r) => r.commons).map((r) => r.commons);
const ledgers = domains.map((d) => ({
  domain: d,
  path: path.join(LABS, "commons", d, "connections.jsonl"),
  rows: readJsonl(path.join(LABS, "commons", d, "connections.jsonl")),
}));
const all = ledgers.flatMap((l) => l.rows.map((r) => ({ ...r, _domain: l.domain })));

function save(domain, rows) {
  const p = path.join(LABS, "commons", domain, "connections.jsonl");
  fs.writeFileSync(p, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
}

function logEvent(resolver, type, detail) {
  const ev = { ts: new Date().toISOString(), resolver, type, detail };
  fs.appendFileSync(path.join(LABS, "runs/log.jsonl"), JSON.stringify(ev) + "\n");
  console.log(`[${ev.ts}] ${type}: ${detail}`);
}

if (action === "list") {
  if (!all.length) {
    console.log("No introductions in any ledger yet. Resolvers propose them during research sessions.");
    process.exit(0);
  }
  const order = ["proposed", "approved", "sent", "replied", "connected", "declined"];
  for (const state of order) {
    const rows = all.filter((r) => r.state === state);
    if (!rows.length) continue;
    console.log(`\n${state.toUpperCase()} (${rows.length})`);
    for (const r of rows) {
      console.log(`  ${r.id}  ${r.org_a}  <->  ${r.org_b}  (proposed ${r.proposed})`);
    }
  }
  console.log(`\nShow one: node pipeline/introductions.mjs --show <id>`);
  process.exit(0);
}

if (!id) {
  console.error(`--${action} requires an introduction id`);
  process.exit(1);
}
const row = all.find((r) => r.id === id);
if (!row) {
  console.error(`No introduction with id ${id}`);
  process.exit(1);
}

if (action === "show") {
  console.log(`\n${row.id}  [${row.state}]  drafted by ${row.resolver.toUpperCase()} on ${row.proposed}`);
  console.log(`\n${row.org_a}  <->  ${row.org_b}`);
  console.log(`\nOVERLAP\n${row.overlap}`);
  console.log(`\nDRAFT\n${row.intro_draft}`);
  console.log(`\nSOURCES\n${(row.sources || []).map((s) => `- ${s}`).join("\n")}`);
  console.log(`\nHISTORY\n${(row.history || []).map((h) => `- ${h.ts} ${h.state}${h.note ? `: ${h.note}` : ""}`).join("\n")}`);
  process.exit(0);
}

const t = TRANSITIONS[action];
if (!t) {
  console.error(`Unknown action --${action}`);
  process.exit(1);
}
if (!t.from.includes(row.state)) {
  console.error(`${id} is "${row.state}"; --${action} requires ${t.from.join(" or ")}.`);
  process.exit(1);
}

row.state = t.to;
row.history = [...(row.history || []), { ts: new Date().toISOString(), state: t.to, ...(note ? { note } : {}) }];
const ledger = ledgers.find((l) => l.domain === row._domain);
ledger.rows = ledger.rows.map((r) => (r.id === row.id ? (({ _domain, ...rest }) => rest)(row) : r));
save(row._domain, ledger.rows);

if (t.to === "approved") {
  const outboxDir = path.join(LABS, "outreach", "outbox");
  fs.mkdirSync(outboxDir, { recursive: true });
  const resolver = REGISTRY.resolvers.find((r) => r.id === row.resolver);
  const out = [
    `# Ready to send -- ${row.id}`,
    `Drafted by ${resolver ? resolver.name : row.resolver}, approved ${new Date().toISOString().slice(0, 10)}.`,
    `Recipients: ${row.org_a} and ${row.org_b} (look up contacts; addresses are never stored in the public ledger).`,
    ``,
    `## Why this introduction`,
    row.overlap,
    ``,
    `## The email`,
    row.intro_draft,
    ``,
    `## Sources cited`,
    ...(row.sources || []).map((s) => `- ${s}`),
    ``,
    `After sending: node pipeline/introductions.mjs --sent ${row.id}`,
    ``,
  ].join("\n");
  fs.writeFileSync(path.join(outboxDir, `${row.id}.md`), out);
  console.log(`Outbox file written: outreach/outbox/${row.id}.md`);
}

logEvent(row.resolver, `intro_${t.to}`, `${row.org_a} <-> ${row.org_b} (${row.id})${note ? ` :: ${note}` : ""}`);
execFileSync(process.execPath, [path.join(HERE, "render-data.mjs")], { stdio: "inherit" });
