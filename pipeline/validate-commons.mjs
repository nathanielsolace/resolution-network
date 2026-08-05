#!/usr/bin/env node
// Resolution Commons validator + seed merger.
// - Merges labs/commons/<domain>/seed/*.jsonl into organizations.jsonl
// - Enforces the record contract (name, url, method, >=1 source URL)
// - Dedupes by website domain (first record wins, sources merge)
// - Optional --check-urls: liveness-checks every record and stamps http_status
// Records failing the contract are quarantined to seed/_rejected.jsonl with a
// reason, never silently dropped and never published.
//
// Usage: node pipeline/validate-commons.mjs [commonsDomain] [--check-urls]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LABS = path.resolve(HERE, "..");
const domain = process.argv.slice(2).find((a) => !a.startsWith("--")) || "ocean";
const CHECK_URLS = process.argv.includes("--check-urls");

const dir = path.join(LABS, "commons", domain);
const seedDir = path.join(dir, "seed");
const outPath = path.join(dir, "organizations.jsonl");
const rejectPath = path.join(seedDir, "_rejected.jsonl");

const readJsonl = (p) =>
  fs.existsSync(p)
    ? fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l, i) => {
        try { return JSON.parse(l); } catch { return { __parse_error: true, __line: i + 1, __file: p }; }
      })
    : [];

const domainOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
};

// Gather: existing canon first (so re-runs keep canon precedence), then seeds.
const canon = readJsonl(outPath);
const seedFiles = fs.existsSync(seedDir)
  ? fs.readdirSync(seedDir).filter((f) => f.endsWith(".jsonl") && !f.startsWith("_"))
  : [];
const seeds = seedFiles.flatMap((f) => readJsonl(path.join(seedDir, f)).map((r) => ({ ...r, __seed: f })));

const rejected = [];
const byDomain = new Map();
let mergedSources = 0;

function admit(rec, origin) {
  if (rec.__parse_error) return rejected.push({ reason: "invalid JSON line", ...rec });
  const d = domainOf(rec.url);
  const sources = (rec.sources || []).filter((s) => /^https?:\/\//.test(s));
  if (!rec.name || rec.name.length < 2) return rejected.push({ reason: "missing name", origin, rec });
  if (!d) return rejected.push({ reason: "invalid url", origin, rec });
  if (!rec.method) return rejected.push({ reason: "missing method", origin, rec });
  if (!sources.length) return rejected.push({ reason: "no verifiable source URL", origin, rec });
  if (byDomain.has(d)) {
    const kept = byDomain.get(d);
    const before = kept.sources.length;
    kept.sources = [...new Set([...kept.sources, ...sources])];
    mergedSources += kept.sources.length - before;
    return;
  }
  const { __seed, ...clean } = rec;
  byDomain.set(d, {
    ...clean,
    sources,
    regions: rec.regions || [],
    hq_country: rec.hq_country ?? null,
    founded: Number.isInteger(rec.founded) ? rec.founded : null,
    scale_note: rec.scale_note ?? null,
    added: rec.added || new Date().toISOString().slice(0, 10),
    verification_status: rec.verification_status || "seed-unverified",
    status: rec.status || "active",
  });
}

canon.forEach((r) => admit(r, "canon"));
seeds.forEach((r) => admit(r, r.__seed));

let records = [...byDomain.values()];

async function checkUrls() {
  const limit = 8;
  let i = 0;
  async function worker() {
    while (i < records.length) {
      const rec = records[i++];
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        const res = await fetch(rec.url, { method: "GET", redirect: "follow", signal: ctrl.signal });
        clearTimeout(t);
        rec.http_status = res.status;
      } catch {
        rec.http_status = null;
      }
      rec.last_verified = new Date().toISOString().slice(0, 10);
      if (rec.http_status === null || rec.http_status >= 500 || rec.http_status === 404) {
        rec.status = "possibly-inactive";
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
}

const run = async () => {
  if (CHECK_URLS) {
    console.log(`Liveness-checking ${records.length} urls...`);
    await checkUrls();
  }
  records.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(outPath, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  if (rejected.length) {
    fs.mkdirSync(seedDir, { recursive: true });
    fs.writeFileSync(rejectPath, rejected.map((r) => JSON.stringify(r)).join("\n") + "\n");
  }
  const methods = {};
  const countries = new Set();
  for (const r of records) {
    methods[r.method] = (methods[r.method] || 0) + 1;
    if (r.hq_country) countries.add(r.hq_country);
  }
  const unreachable = records.filter((r) => r.status === "possibly-inactive").length;
  console.log(`Commons[${domain}]: ${records.length} organizations (${canon.length} canon + seeds from ${seedFiles.length} files)`);
  console.log(`  methods: ${Object.entries(methods).map(([k, v]) => `${k}:${v}`).join("  ")}`);
  console.log(`  countries: ${countries.size} | merged duplicate sources: ${mergedSources} | rejected: ${rejected.length}${CHECK_URLS ? ` | flagged possibly-inactive: ${unreachable}` : ""}`);
};

run();
