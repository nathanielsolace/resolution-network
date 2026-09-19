#!/usr/bin/env node
// Resolution Network — Resolver research run
// One invocation = one research session for one Resolver:
//   read its Commons -> search the live web -> propose new cited org records
//   + an update to its standing Resolver Report -> append to the Commons
//   -> regenerate dashboard data.
// Honesty contract: every record and every report claim carries source URLs.
// The script never invents data; if the model returns a record without a
// source, the record is dropped and logged. Findings without sources are
// dropped the same way.
//
// Usage:
//   node pipeline/run-resolver.mjs [resolverId] [--dry]
//   ANTHROPIC_API_KEY required unless --dry.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LABS = path.resolve(HERE, "..");
const REGISTRY = JSON.parse(fs.readFileSync(path.join(LABS, "resolvers/registry.json"), "utf8"));

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const resolverId = args.find((a) => !a.startsWith("--")) || "triton";
const resolver = REGISTRY.resolvers.find((r) => r.id === resolverId);
if (!resolver) {
  console.error(`Unknown resolver: ${resolverId}`);
  process.exit(1);
}
if (resolver.status === "queued") {
  console.error(`${resolver.name} is in the commission queue; it has no armed pipeline yet.`);
  process.exit(1);
}

const MODEL = process.env.RESOLVER_MODEL || "claude-sonnet-5";
const commonsDir = path.join(LABS, "commons", resolver.commons);
const orgsPath = path.join(commonsDir, "organizations.jsonl");
const briefsDir = path.join(commonsDir, "briefs");
const reportPath = path.join(commonsDir, "report.json");
const runsPath = path.join(LABS, "runs", "log.jsonl");
fs.mkdirSync(briefsDir, { recursive: true });
fs.mkdirSync(path.dirname(runsPath), { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();

function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function logEvent(type, detail) {
  const ev = { ts: now(), resolver: resolver.id, type, detail };
  fs.appendFileSync(runsPath, JSON.stringify(ev) + "\n");
  console.log(`[${ev.ts}] ${type}: ${detail}`);
}

// The session's output contract. Delivered as ONE client-side tool call
// (submit_session) rather than as a strict output grammar: the strict
// json_schema format plus two server tools compiled to a grammar the API
// rejected ("compiled grammar is too large") on every run from 08-08 on.
// The honesty gates in main() validate the content; the schema only shapes it.
const SESSION_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["new_organizations", "report_update", "findings_delta", "introduction_candidates", "hardware_proposals", "funding_leads", "accountability_flags", "top_of_mind", "status_line", "run_notes"],
    properties: {
      new_organizations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "url", "method", "sources"],
          properties: {
            name: { type: "string" },
            url: { type: "string" },
            hq_country: { type: ["string", "null"] },
            regions: { type: "array", items: { type: "string" } },
            method: { type: "string" },
            founded: { type: ["integer", "null"] },
            scale_note: { type: ["string", "null"] },
            sources: { type: "array", items: { type: "string" } },
          },
        },
      },
      report_update: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary_points", "body", "sources"],
        properties: {
          title: { type: "string" },
          summary_points: { type: "array", items: { type: "string" }, minItems: 1 },
          body: { type: "string" },
          sources: { type: "array", items: { type: "string" } },
        },
      },
      findings_delta: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "sources"],
          properties: {
            text: { type: "string" },
            sources: { type: "array", items: { type: "string" } },
          },
        },
      },
      introduction_candidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["org_a", "org_b", "overlap", "intro_draft", "sources"],
          properties: {
            org_a: { type: "string" },
            org_b: { type: "string" },
            overlap: { type: "string" },
            intro_draft: { type: "string" },
            sources: { type: "array", items: { type: "string" } },
          },
        },
      },
      hardware_proposals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "description", "addresses", "sources"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            addresses: { type: "string" },
            cost_note: { type: ["string", "null"] },
            sources: { type: "array", items: { type: "string" } },
          },
        },
      },
      funding_leads: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "kind", "relevance", "sources"],
          properties: {
            name: { type: "string" },
            kind: { type: "string" },
            amount_note: { type: ["string", "null"] },
            relevance: { type: "string" },
            url: { type: ["string", "null"] },
            sources: { type: "array", items: { type: "string" } },
          },
        },
      },
      accountability_flags: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["org", "concern", "sources"],
          properties: {
            org: { type: "string" },
            concern: { type: "string" },
            sources: { type: "array", items: { type: "string" } },
          },
        },
      },
      top_of_mind: { type: "array", items: { type: "string" }, minItems: 1 },
      status_line: { type: "string" },
      run_notes: { type: "string" },
    },
};

// The research method lives in METHOD.md (shared) plus resolvers/<id>.md
// (per-Resolver nuance). This function only fills the placeholders. There is
// no prompt text in this file on purpose: the method is a public document.
const METHOD_PATH = path.join(LABS, "METHOD.md");
const APPROACH_PATH = path.join(LABS, "resolvers", `${resolver.id}.md`);

function methodBody(file) {
  // Everything between the first and last "---" line is the sendable text.
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const rules = lines.map((l, i) => (l.trim() === "---" ? i : -1)).filter((i) => i >= 0);
  if (rules.length < 2) throw new Error(`${path.basename(file)} needs an opening and closing --- rule`);
  return lines.slice(rules[0] + 1, rules[rules.length - 1]).join("\n").trim();
}

function buildPrompt(existing, report) {
  const knownDomains = existing.map((o) => domainOf(o.url)).filter(Boolean);
  const chain = resolver.chain || {};
  const methods = resolver.methods_tracked.join(", ");
  const recordRules = `For each organization you propose: it must actually exist on the live web right now, its "sources" array must contain URLs of pages you actually loaded this session that establish it, "method" must be one of: ${methods}. Unknown founding year is null, never a guess. Only include a scale_note if a source you loaded states it.`;
  const fills = {
    name: resolver.name,
    role: resolver.role,
    one_liner: resolver.one_liner,
    mission: resolver.mission,
    voice_note: resolver.voice_note,
    drive: resolver.drive || "(none recorded)",
    tracking: resolver.tracking.map((t) => `- ${t}`).join("\n"),
    premise: resolver.report.premise,
    chain_signal: chain.signal || "Find what is new in your domain.",
    chain_baseline: chain.baseline || "Your Commons is the baseline.",
    chain_delta: chain.delta || "Compare the new signal against the baseline.",
    chain_interpret: chain.interpret || "Say what the difference means and costs.",
    chain_publish: chain.publish || "Update the report with sources.",
    chain_connect: chain.connect || "Note which organizations should meet.",
    commons_count: String(existing.length),
    job_1: existing.length === 0
      ? `JOB 1 - Found the Commons. The dataset is empty; this is the founding session. Establish the first 8 to 15 organization records for this mandate, spread across its methods and regions, each one verified on the live web this session. ${recordRules}`
      : `JOB 1 - Extend the Commons. Find organizations working on this mandate that are NOT in the known-domain list below. Prioritize the regions and methods that are thin in the dataset, and anything named in the report's standing findings as a gap. ${recordRules}`,
    prior_findings: (report.findings || []).map((f) => `- ${f.text}`).join("\n") || "(none yet)",
    known_domains: knownDomains.join(", ") || "(none yet)",
    resolver_approach: fs.existsSync(APPROACH_PATH) ? methodBody(APPROACH_PATH) : "",
  };
  let text = methodBody(METHOD_PATH);
  for (const [k, v] of Object.entries(fills)) text = text.split(`{{${k}}}`).join(v);
  const missing = text.match(/\{\{[a-z_]+\}\}/g);
  if (missing) throw new Error(`METHOD.md has unfilled placeholders: ${[...new Set(missing)].join(" ")}`);
  return text;
}

async function runLive(existing, report) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const tools = [
    // Plain variants on purpose. The _20260209 "dynamic filtering" variants
    // run a code sandbox around every search; on 2026-09-19 that sandbox ate
    // the whole budget on wrapper scripts and fetched nothing (958k input
    // tokens, zero records). Direct calls: one search, one result set.
    { type: "web_search_20250305", name: "web_search", max_uses: 12 },
    { type: "web_fetch_20250910", name: "web_fetch", max_uses: 8 },
    {
      name: "submit_session",
      description: "Publish this research session. Call exactly once, at the end, with every field. This call is the publication; nothing else you write is read.",
      input_schema: SESSION_SCHEMA,
    },
  ];
  let messages = [{ role: "user", content: buildPrompt(existing, report) }];
  let response;
  for (let i = 0; i < 6; i++) {
    // Streaming keeps long web-search sessions alive past the SDK's
    // non-streaming HTTP timeout; finalMessage() returns the complete message.
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      tools,
      messages,
    });
    response = await stream.finalMessage();
    messages = [...messages, { role: "assistant", content: response.content }];
    if (response.stop_reason === "pause_turn") {
      logEvent("run_continued", `server tool loop continued (round ${i + 1})`);
      continue;
    }
    const called = response.content.some((b) => b.type === "tool_use" && b.name === "submit_session");
    if (called || response.stop_reason !== "end_turn" || i >= 4) break;
    // The model ended its turn in prose without publishing. One reminder.
    logEvent("run_continued", `no submit_session call yet; asking for it (round ${i + 1})`);
    messages = [...messages, { role: "user", content: "Research is over. Call submit_session now with everything you established this session, every field filled. No further searching." }];
  }
  // Keep the raw transcript for audit; the honesty gates read only the tool input.
  const rawDir = path.join(LABS, "runs", "raw");
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(path.join(rawDir, `${resolver.id}-${today}.json`), JSON.stringify(messages, null, 2));
  if (response.stop_reason === "refusal") {
    throw new Error("Request was declined by safety classifiers (stop_reason: refusal).");
  }
  const usage = response.usage;
  logEvent(
    "model_usage",
    `in ${usage.input_tokens} / out ${usage.output_tokens} tokens on ${response.model}`
  );
  // The publication is the submit_session tool call. Its input is already
  // parsed JSON (the SDK parses tool inputs); the honesty gates validate it.
  const submit = response.content.filter((b) => b.type === "tool_use" && b.name === "submit_session").pop();
  if (submit && submit.input && typeof submit.input === "object") {
    logEvent("session_submitted", "publication delivered via submit_session");
    return normalizeSubmission(submit.input);
  }
  logEvent("session_unsubmitted", "no submit_session call; falling back to text parse (weak)");
  if (response.stop_reason === "max_tokens") {
    throw new Error("Session hit max_tokens before calling submit_session; nothing published.");
  }
  // Fallback: an older-style JSON text block. Walk backwards until one parses.
  const textBlocks = response.content.filter((b) => b.type === "text").map((b) => b.text);
  for (let i = textBlocks.length - 1; i >= 0; i--) {
    const t = textBlocks[i];
    try {
      return JSON.parse(t);
    } catch {
      const start = t.indexOf("{");
      const end = t.lastIndexOf("}");
      if (start !== -1 && end > start) {
        try {
          return JSON.parse(t.slice(start, end + 1));
        } catch { /* keep walking */ }
      }
    }
  }
  throw new Error("No parseable structured output in response text blocks.");
}

// Without strict tool use the model sometimes writes a nested object as a
// JSON string, or lifts a nested field (body, sources) to the top level.
// Repair the shape here; the honesty gates judge the content afterwards.
function normalizeSubmission(input) {
  const out = { ...input };
  const parseIfJson = (v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (!(t.startsWith("{") || t.startsWith("["))) return v;
    try { return JSON.parse(t); } catch { /* maybe truncated */ }
    for (const tail of ['"}', '"]}', '"]', ']}', '}', ']']) {
      try { return JSON.parse(t + tail); } catch { /* next */ }
    }
    return v;
  };
  for (const k of Object.keys(SESSION_SCHEMA.properties)) out[k] = parseIfJson(out[k]);
  for (const k of ["new_organizations", "findings_delta", "introduction_candidates", "hardware_proposals", "funding_leads", "accountability_flags", "top_of_mind"]) {
    if (!Array.isArray(out[k])) out[k] = [];
    out[k] = out[k].map(parseIfJson);
  }
  if (typeof out.report_update === "string") {
    // Unrepairable string: salvage the title, take body and sources from the top level.
    const title = (out.report_update.match(/"title"\s*:\s*"([^"]+)"/) || [])[1] || out.title || null;
    out.report_update = { title, summary_points: [], body: out.body || null, sources: out.sources || [] };
  }
  if (out.report_update && typeof out.report_update === "object") {
    const u = out.report_update;
    if (!u.body && typeof out.body === "string") u.body = out.body;
    if (!Array.isArray(u.sources) && Array.isArray(out.sources)) u.sources = out.sources;
    if (!Array.isArray(u.summary_points)) u.summary_points = [];
  }
  return out;
}

function dryFixture() {
  return {
    new_organizations: [],
    introduction_candidates: [],
    hardware_proposals: [],
    funding_leads: [],
    accountability_flags: [],
    report_update: {
      title: "Dry run: pipeline plumbing check",
      summary_points: ["Dry run only; nothing here publishes."],
      body: "This is a dry run. No research was performed and nothing here should be published. The pipeline read the Commons and the report, built the prompt, skipped the API call, and exercised the write path end to end.",
      sources: [],
    },
    findings_delta: [],
    top_of_mind: [],
    status_line: "",
    run_notes: "Dry run only.",
  };
}

async function main() {
  const existing = readJsonl(orgsPath);
  const report = fs.existsSync(reportPath)
    ? JSON.parse(fs.readFileSync(reportPath, "utf8"))
    : { status_line: null, updated: null, top_of_mind: [], findings: [], updates: [] };
  if (args.includes("--print-prompt")) {
    // Show exactly what the model receives this session, then stop. No API
    // call, no log event, nothing written.
    process.stdout.write(buildPrompt(existing, report) + "\n");
    return;
  }
  logEvent("run_started", `${resolver.name} research session (${existing.length} orgs in commons)${DRY ? " [DRY]" : ""}`);

  let result;
  try {
    result = DRY ? dryFixture() : await runLive(existing, report);
  } catch (err) {
    logEvent("run_failed", String(err.message || err));
    process.exit(1);
  }

  // Honesty gate: drop anything without a loadable source URL.
  const existingDomains = new Set(existing.map((o) => domainOf(o.url)).filter(Boolean));
  const accepted = [];
  let dropped = 0;
  for (const org of result.new_organizations || []) {
    const d = domainOf(org.url);
    const hasSources = Array.isArray(org.sources) && org.sources.some((s) => /^https?:\/\//.test(s));
    if (!d || !hasSources || existingDomains.has(d)) {
      dropped++;
      continue;
    }
    existingDomains.add(d);
    accepted.push({
      ...org,
      added: today,
      verification_status: "resolver-proposed",
      status: org.status || "active",
    });
  }
  if (accepted.length) {
    fs.appendFileSync(orgsPath, accepted.map((o) => JSON.stringify(o)).join("\n") + "\n");
    logEvent("orgs_added", `${accepted.length} new organizations proposed (${dropped} dropped by honesty gate)`);
  } else {
    logEvent("orgs_added", `0 new organizations this session (${dropped} dropped by honesty gate)`);
  }

  // Introduction candidates: the connection duty. Gate: both orgs must exist
  // in the Commons by exact name (this session's accepted records count),
  // sources required, pair-deduped against the ledger. State starts at
  // "proposed"; nothing advances past it without the human approval CLI.
  const connectionsPath = path.join(commonsDir, "connections.jsonl");
  const knownNames = new Set([...existing, ...accepted].map((o) => o.name.toLowerCase().trim()));
  const priorConnections = readJsonl(connectionsPath);
  const pairKey = (a, b) => [a.toLowerCase().trim(), b.toLowerCase().trim()].sort().join(" :: ");
  const knownPairs = new Set(priorConnections.map((c) => pairKey(c.org_a, c.org_b)));
  const proposedIntros = [];
  let introsDropped = 0;
  for (const c of result.introduction_candidates || []) {
    const bothKnown =
      c.org_a && c.org_b &&
      knownNames.has(c.org_a.toLowerCase().trim()) &&
      knownNames.has(c.org_b.toLowerCase().trim());
    const cited = Array.isArray(c.sources) && c.sources.some((s) => /^https?:\/\//.test(s));
    const fresh = c.org_a && c.org_b && !knownPairs.has(pairKey(c.org_a, c.org_b));
    if (!bothKnown || !cited || !fresh || !c.intro_draft || !c.overlap) {
      introsDropped++;
      continue;
    }
    knownPairs.add(pairKey(c.org_a, c.org_b));
    proposedIntros.push({
      id: `${resolver.id}-${today}-${proposedIntros.length + 1}`,
      resolver: resolver.id,
      state: "proposed",
      proposed: today,
      org_a: c.org_a,
      org_b: c.org_b,
      overlap: c.overlap,
      intro_draft: c.intro_draft,
      sources: c.sources,
      history: [{ ts: now(), state: "proposed" }],
    });
  }
  if (!DRY && proposedIntros.length) {
    fs.appendFileSync(connectionsPath, proposedIntros.map((c) => JSON.stringify(c)).join("\n") + "\n");
  }
  if (!DRY) {
    logEvent(
      "intros_proposed",
      `${proposedIntros.length} introduction${proposedIntros.length === 1 ? "" : "s"} drafted for the approval queue${introsDropped ? ` (${introsDropped} dropped by honesty gate)` : ""}`
    );
  }

  // Hardware, funding, and accountability: three more gated ledgers, same
  // discipline as everything else. Sources required; empty is honest.
  function writeGatedLedger(fileName, items, dedupeKey, buildRow) {
    const p = path.join(commonsDir, fileName);
    const existingRows = readJsonl(p);
    const known = new Set(existingRows.map((r) => String(r[dedupeKey]).toLowerCase().trim()));
    const accepted = [];
    let droppedCount = 0;
    for (const item of items || []) {
      const key = item[dedupeKey] ? String(item[dedupeKey]).toLowerCase().trim() : null;
      const cited = Array.isArray(item.sources) && item.sources.some((s) => /^https?:\/\//.test(s));
      if (!key || !cited || known.has(key)) {
        droppedCount++;
        continue;
      }
      known.add(key);
      accepted.push(buildRow(item));
    }
    if (!DRY && accepted.length) {
      fs.appendFileSync(p, accepted.map((r) => JSON.stringify(r)).join("\n") + "\n");
    }
    return { accepted: accepted.length, dropped: droppedCount };
  }

  if (!DRY) {
    const hw = writeGatedLedger("hardware.jsonl", result.hardware_proposals, "name", (i) => ({
      ...i, resolver: resolver.id, proposed: today,
    }));
    if (hw.accepted || hw.dropped) {
      logEvent("hardware_proposed", `${hw.accepted} hardware/software spec${hw.accepted === 1 ? "" : "s"} proposed${hw.dropped ? ` (${hw.dropped} dropped by honesty gate)` : ""}`);
    }
    const fl = writeGatedLedger("funding.jsonl", result.funding_leads, "name", (i) => ({
      ...i, resolver: resolver.id, flagged: today,
    }));
    if (fl.accepted || fl.dropped) {
      logEvent("funding_flagged", `${fl.accepted} funding lead${fl.accepted === 1 ? "" : "s"} flagged${fl.dropped ? ` (${fl.dropped} dropped by honesty gate)` : ""}`);
    }
    const af = writeGatedLedger("accountability.jsonl", result.accountability_flags, "org", (i) => ({
      ...i, resolver: resolver.id, flagged: today,
    }));
    if (af.accepted || af.dropped) {
      logEvent("accountability_flagged", `${af.accepted} accountability flag${af.accepted === 1 ? "" : "s"} raised${af.dropped ? ` (${af.dropped} dropped by honesty gate)` : ""}`);
    }
  }

  // Quality gate on the report itself: a degenerate or filler update never
  // publishes. Same spirit as the record gate; an honest silence beats noise.
  const degenerate = (s) => !s || /placeholder|lorem ipsum/i.test(s);
  const updateOk =
    result.report_update &&
    !degenerate(result.report_update.title) &&
    !degenerate(result.report_update.body) &&
    String(result.report_update.body).length >= 200;
  if (!DRY && result.report_update && !updateOk) {
    logEvent("update_rejected", "report update failed the quality gate (degenerate or under-length body); nothing published");
  }
  if (degenerate(result.status_line)) result.status_line = null;
  result.top_of_mind = (result.top_of_mind || []).filter((m) => !degenerate(m));

  if (!DRY && updateOk) {
    const u = result.report_update;
    // The update archive: one markdown file per session, the report's history.
    const briefPath = path.join(briefsDir, `${today}.md`);
    const fm = [
      "---",
      `resolver: ${resolver.id}`,
      `date: ${today}`,
      `title: ${JSON.stringify(u.title)}`,
      "---",
      "",
      u.body.trim(),
      "",
      "## Sources",
      ...(u.sources || []).map((s) => `- ${s}`),
      "",
    ].join("\n");
    fs.writeFileSync(briefPath, fm);

    // The living report state. Findings pass the same gate as records:
    // no sources, no publication.
    const cleanDelta = (result.findings_delta || []).filter(
      (f) => f.text && Array.isArray(f.sources) && f.sources.some((s) => /^https?:\/\//.test(s))
    );
    const droppedFindings = (result.findings_delta || []).length - cleanDelta.length;
    const known = new Set((report.findings || []).map((f) => f.text));
    const findings = [...(report.findings || []), ...cleanDelta.filter((f) => !known.has(f.text))];
    const updates = (report.updates || []).filter((x) => x.date !== today);
    updates.push({ date: today, title: u.title, summary_points: u.summary_points || [], sources: u.sources || [] });
    const next = {
      status_line: result.status_line || report.status_line,
      updated: today,
      top_of_mind: (result.top_of_mind || []).length ? result.top_of_mind : report.top_of_mind,
      findings,
      updates,
    };
    fs.writeFileSync(reportPath, JSON.stringify(next, null, 2) + "\n");
    logEvent(
      "report_updated",
      `${u.title} (+${cleanDelta.length} findings${droppedFindings ? `, ${droppedFindings} dropped by honesty gate` : ""}, ${findings.length} standing)`
    );
  }

  logEvent("run_completed", `notes: ${(result.run_notes || "").slice(0, 200)}`);

  // Regenerate dashboard data so Resolution Live reflects this run.
  execFileSync(process.execPath, [path.join(HERE, "render-data.mjs")], { stdio: "inherit" });
}

main();
