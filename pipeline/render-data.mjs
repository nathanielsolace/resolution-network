#!/usr/bin/env node
// Renders site/data/*.json from the Commons + run log + registry.
// This is the only bridge between the engine and Resolution Live:
// if it is not in the Commons or the run log, it does not appear on a screen.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LABS = path.resolve(HERE, "..");
const SITE = path.resolve(LABS, "..", "site");
const REGISTRY = JSON.parse(fs.readFileSync(path.join(LABS, "resolvers/registry.json"), "utf8"));

const readJsonl = (p) =>
  fs.existsSync(p)
    ? fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l))
    : [];
const readJson = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : fallback);

const dataDir = path.join(SITE, "data");
fs.mkdirSync(dataDir, { recursive: true });

const runLog = readJsonl(path.join(LABS, "runs/log.jsonl"));

const hostOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
};

const LIVE = REGISTRY.resolvers.filter((r) => r.status !== "queued");
const QUEUE = REGISTRY.resolvers.filter((r) => r.status === "queued");

// Connection funnel: computed from the ledgers, never hardcoded. Public data
// carries counts at every stage; full pair detail is public only once a
// connection is confirmed (doctrine: recipient details stay private before that).
const FUNNEL_STAGES = ["proposed", "approved", "sent", "replied", "connected", "declined"];
const emptyFunnel = () => Object.fromEntries(FUNNEL_STAGES.map((s) => [s, 0]));
const connectionLedger = (domain) => readJsonl(path.join(LABS, "commons", domain, "connections.jsonl"));
const funnelOf = (rows) => {
  const f = emptyFunnel();
  for (const c of rows) if (f[c.state] !== undefined) f[c.state]++;
  return f;
};

// ---- live resolvers -------------------------------------------------------
const resolvers = LIVE.map((r) => {
  const commonsDir = path.join(LABS, "commons", r.commons);
  const orgs = readJsonl(path.join(commonsDir, "organizations.jsonl"));
  const briefsDir = path.join(commonsDir, "briefs");
  const briefs = fs.existsSync(briefsDir)
    ? fs.readdirSync(briefsDir).filter((f) => f.endsWith(".md")).sort()
    : [];
  // Runs before mandate_start belong to a previous mandate (NEREUS's deep-ocean
  // era stays in the network pulse as history, not in the recommissioned page).
  const since = r.mandate_start || "0000";
  const runs = runLog.filter((e) => e.resolver === r.id && e.ts.slice(0, 10) >= since);
  const lastRun = runs.filter((e) => e.type === "run_completed").at(-1) || null;
  const connections = connectionLedger(r.commons);
  const methods = {};
  const countries = new Set();
  let sourceCount = 0;
  for (const o of orgs) {
    methods[o.method] = (methods[o.method] || 0) + 1;
    if (o.hq_country) countries.add(o.hq_country);
    sourceCount += (o.sources || []).length;
  }
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    designation: r.designation,
    domain: r.domain,
    accent: r.accent,
    accent_soft: r.accent_soft,
    status: orgs.length || briefs.length ? (lastRun ? "active" : "commissioning") : r.status,
    mandate_start: r.mandate_start || null,
    recommissioned: r.recommissioned || null,
    one_liner: r.one_liner,
    tracking: r.tracking,
    mission: r.mission,
    drive: r.drive || null,
    first_question: r.first_question,
    report_premise: r.report ? r.report.premise : null,
    orgs_mapped: orgs.length,
    countries: countries.size,
    sources_cited: sourceCount,
    methods,
    briefs_published: briefs.length,
    latest_brief: briefs.at(-1) || null,
    last_run: lastRun ? lastRun.ts : null,
    connections: funnelOf(connections),
    _connections: connections,
    _orgs: orgs,
    _commonsDir: commonsDir,
    _briefFiles: briefs,
  };
});

// True union of headquarters countries across every commons (not a max, not a sum).
const countryUnion = new Set();
for (const r of resolvers) for (const o of r._orgs) if (o.hq_country) countryUnion.add(o.hq_country);

// Stewarded datasets (compiled under a previous mandate, held for a queued
// Resolver) are still published Commons data; network totals include them,
// broken out transparently.
const stewarded = { orgs_mapped: 0, sources_cited: 0, briefs_published: 0, commons: [] };
for (const q of QUEUE) {
  if (!q.inherits) continue;
  const orgs = readJsonl(path.join(LABS, "commons", q.inherits, "organizations.jsonl"));
  const briefsDir = path.join(LABS, "commons", q.inherits, "briefs");
  for (const o of orgs) {
    if (o.hq_country) countryUnion.add(o.hq_country);
    stewarded.sources_cited += (o.sources || []).length;
  }
  stewarded.orgs_mapped += orgs.length;
  stewarded.briefs_published += fs.existsSync(briefsDir)
    ? fs.readdirSync(briefsDir).filter((f) => f.endsWith(".md")).length
    : 0;
  stewarded.commons.push(q.inherits);
}

const totals = {
  orgs_mapped: resolvers.reduce((n, r) => n + r.orgs_mapped, 0) + stewarded.orgs_mapped,
  sources_cited: resolvers.reduce((n, r) => n + r.sources_cited, 0) + stewarded.sources_cited,
  countries: countryUnion.size,
  briefs_published: resolvers.reduce((n, r) => n + r.briefs_published, 0) + stewarded.briefs_published,
  stewarded,
  connections: resolvers.reduce((acc, r) => {
    for (const s of FUNNEL_STAGES) acc[s] += r.connections[s];
    return acc;
  }, emptyFunnel()),
  resolvers_active: resolvers.filter((r) => r.status === "active").length,
  resolvers_live: resolvers.length,
  resolvers_total: REGISTRY.resolvers.length,
};

// ---- commission queue (planned, honest: no fabricated telemetry) ----------
const queue = QUEUE.map((q) => {
  let inherited = null;
  if (q.inherits) {
    const orgs = readJsonl(path.join(LABS, "commons", q.inherits, "organizations.jsonl"));
    const briefsDir = path.join(LABS, "commons", q.inherits, "briefs");
    const countries = new Set();
    let sources = 0;
    for (const o of orgs) {
      if (o.hq_country) countries.add(o.hq_country);
      sources += (o.sources || []).length;
    }
    inherited = {
      commons: q.inherits,
      orgs_mapped: orgs.length,
      countries: countries.size,
      sources_cited: sources,
      briefs_published: fs.existsSync(briefsDir) ? fs.readdirSync(briefsDir).filter((f) => f.endsWith(".md")).length : 0,
      note: "Dataset compiled under NEREUS RN-005's first mandate; transfers to this Resolver at commissioning.",
    };
  }
  return {
    id: q.id,
    name: q.name,
    role: q.role,
    designation: q.designation,
    accent: q.accent,
    accent_soft: q.accent_soft,
    status: "queued",
    wave: q.wave || 2,
    one_liner: q.one_liner,
    tracking: q.tracking,
    first_question: q.first_question,
    inherited,
  };
});

const network = {
  generated_at: new Date().toISOString(),
  network: REGISTRY.network,
  resolvers: resolvers.map(({ _orgs, _commonsDir, _briefFiles, _connections, ...pub }) => pub),
  queue,
  totals,
  pulse: runLog.slice(-40).reverse(),
};

fs.writeFileSync(path.join(dataDir, "network.json"), JSON.stringify(network, null, 2));

// ---- per-Resolver feeds: ledger, report, legacy brief ----------------------
const parseBrief = (raw, fname) => {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const fm = m ? m[1] : "";
  const body = (m ? m[2] : raw).trim();
  const title = (fm.match(/title:\s*"?(.*?)"?\s*$/m) || [])[1] || fname;
  const date = (fm.match(/date:\s*(\S+)/) || [])[1] || fname.replace(".md", "");
  const [prose, sourcesBlock] = body.split(/\n## Sources\n?/);
  return {
    date,
    title,
    body: prose.trim(),
    sources: (sourcesBlock || "").split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2)),
  };
};

for (const r of resolvers) {
  const reg = LIVE.find((x) => x.id === r.id);
  fs.writeFileSync(
    path.join(dataDir, `${r.id}-organizations.json`),
    JSON.stringify({ generated_at: network.generated_at, count: r._orgs.length, organizations: r._orgs }, null, 2)
  );

  // Every source URL this commons cites, for honest watch-state computation.
  const citedHosts = [];
  for (const o of r._orgs) {
    if (o.url) citedHosts.push(hostOf(o.url));
    for (const s of o.sources || []) citedHosts.push(hostOf(s));
  }

  // The living report: registry doctrine + commons report state + full update archive.
  const state = readJson(path.join(r._commonsDir, "report.json"), {
    status_line: null, updated: null, top_of_mind: [], findings: [], updates: [],
  });
  const archive = r._briefFiles
    .map((f) => parseBrief(fs.readFileSync(path.join(r._commonsDir, "briefs", f), "utf8"), f))
    .map((u) => {
      const meta = (state.updates || []).find((x) => x.date === u.date) || {};
      return { ...u, summary_points: meta.summary_points || [] };
    })
    .reverse(); // newest first
  citedHosts.push(...archive.flatMap((u) => u.sources.map(hostOf)));

  const watches = (reg.watches || []).map((w) => {
    const host = w.url ? hostOf(w.url) : null;
    const citations = host
      ? citedHosts.filter((h) => h && (h === host || h.endsWith("." + host))).length
      : null;
    return { ...w, citations };
  });

  // Public connection view: full pair detail only after confirmation.
  const confirmed = r._connections
    .filter((c) => c.state === "connected")
    .map((c) => ({ id: c.id, org_a: c.org_a, org_b: c.org_b, overlap: c.overlap, sources: c.sources, connected: (c.history || []).find((h) => h.state === "connected")?.ts || null }));

  const report = {
    generated_at: network.generated_at,
    resolver: r.id,
    premise: reg.report ? reg.report.premise : null,
    drive: reg.drive || null,
    chain: reg.chain || null,
    connections: { funnel: r.connections, confirmed },
    watches,
    status_line: state.status_line,
    updated: state.updated,
    top_of_mind: state.top_of_mind || [],
    findings: state.findings || [],
    updates: archive,
    updates_total: archive.length,
  };
  fs.writeFileSync(path.join(dataDir, `${r.id}-report.json`), JSON.stringify(report, null, 2));

  // Legacy shape kept so nothing external breaks; latest update only.
  const latest = archive[0] || null;
  fs.writeFileSync(
    path.join(dataDir, `${r.id}-brief.json`),
    JSON.stringify({ brief: latest ? { ...latest, total_published: archive.length } : null }, null, 2)
  );
}

// ---- stewarded datasets stay public (POSEIDON queue holds deep-ocean) ------
for (const q of queue) {
  if (!q.inherited) continue;
  const orgs = readJsonl(path.join(LABS, "commons", q.inherited.commons, "organizations.jsonl"));
  fs.writeFileSync(
    path.join(dataDir, `${q.id}-organizations.json`),
    JSON.stringify({ generated_at: network.generated_at, count: orgs.length, steward: q.id, compiled_under: "nereus", organizations: orgs }, null, 2)
  );
}

// Alias kept for older links to the first Commons dataset.
const ocean = readJsonl(path.join(LABS, "commons/ocean/organizations.jsonl"));
fs.writeFileSync(
  path.join(dataDir, "ocean-organizations.json"),
  JSON.stringify({ generated_at: network.generated_at, count: ocean.length, organizations: ocean }, null, 2)
);

console.log(
  `Rendered site data: ${totals.orgs_mapped} orgs, ${totals.sources_cited} sources, ${totals.countries} countries (true union), ${totals.briefs_published} report updates, ${queue.length} queued resolvers, ${network.pulse.length} pulse events.`
);
