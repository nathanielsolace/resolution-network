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

const OUTPUT_SCHEMA = {
  type: "json_schema",
  schema: {
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
  },
};

function buildPrompt(existing, report) {
  const knownDomains = existing.map((o) => domainOf(o.url)).filter(Boolean);
  const chain = resolver.chain || {};
  const priorFindings = (report.findings || []).map((f) => `- ${f.text}`).join("\n") || "(none yet)";
  return `You are ${resolver.name}, ${resolver.role} of the Resolution Network: an autonomous research agent whose work is published openly, with sources, for anyone to verify.

Your mandate: ${resolver.one_liner}
Your mission: ${resolver.mission}
Your voice: ${resolver.voice_note}
${resolver.drive ? `\nYour drive, the thing you cannot let go of:\n${resolver.drive}\nWhen time or tool budget runs short in a session, spend what remains on this. It is your tiebreaker.\n` : ""}
You track, specifically:
${resolver.tracking.map((t) => `- ${t}`).join("\n")}

You maintain ONE standing document, the ${resolver.name} Report. Its premise: ${resolver.report.premise}
You do not write standalone posts. Every session updates that one report.

Your research chain, every session:
1. SIGNAL - ${chain.signal || "Find what is new in your domain."}
2. BASELINE - ${chain.baseline || "Your Commons is the baseline."} It currently holds ${existing.length} organizations.
3. DELTA - ${chain.delta || "Compare the new signal against the baseline."}
4. INTERPRET - ${chain.interpret || "Say what the difference means and costs."}
5. PUBLISH - ${chain.publish || "Update the report with sources."}
6. CONNECT - ${chain.connect || "Note which organizations should meet."}

Today's session, concretely:

${existing.length === 0
    ? `JOB 1 - Found the Commons. The dataset is empty; this is the founding session. Establish the first 8 to 15 organization records for this mandate, spread across its methods and regions, each one verified on the live web this session. For each organization you propose: it must actually exist on the live web right now, its "sources" array must contain URLs of pages you actually loaded this session that establish it, "method" must be one of: ${resolver.methods_tracked.join(", ")}. Unknown founding year is null, never a guess. Only include a scale_note if a source you loaded states it.`
    : `JOB 1 - Extend the Commons. Find organizations working on this mandate that are NOT in the known-domain list below. Prioritize the regions and methods that are thin in the dataset, and anything named in the report's standing findings as a gap. For each organization you propose: it must actually exist on the live web right now, its "sources" array must contain URLs of pages you actually loaded this session that establish it, "method" must be one of: ${resolver.methods_tracked.join(", ")}. Unknown founding year is null, never a guess. Only include a scale_note if a source you loaded states it.`}

JOB 2 - Update the ${resolver.name} Report. The report's findings so far:
${priorFindings}

Produce report_update: a titled update on what this session changed. summary_points are 2 to 5 short bullets a reader scans first; body is 300 to 500 words of plain prose in your voice, short paragraphs, no headings. Specific numbers only when a listed source states them; every factual claim backed by a URL in the update's sources array.

Produce findings_delta: 0 to 4 NEW standing findings this session established, each one sentence or two, each with its source URLs. A finding is a durable fact about the state of your domain's map, not a session anecdote. Do not repeat prior findings.

JOB 3 - Propose introductions. Look across the Commons and this session's work for at most 2 pairs of organizations that should be one conversation: same method in adjacent regions, complementary capabilities, one holding data the other needs, or demonstrably duplicated work. For each pair produce introduction_candidates: org_a and org_b EXACTLY as named in the Commons, overlap (2 to 4 sentences stating the specific connection points, every factual claim cited in sources), and intro_draft (a short email in your voice, under 180 words, that a human steward will review before anything sends; specific, generous, zero flattery, every claim in it backed by the sources array). Propose zero pairs if no pairing this session would genuinely help both sides. These drafts NEVER send without human approval.

JOB 4 - Hardware and software worth building. If this session's research surfaced a gap that a specific piece of hardware, sensor, software tool, or automation would close, propose it in hardware_proposals: name, description (what it is, 2 to 4 sentences), addresses (which specific gap in your mandate it closes), cost_note (a real cited cost or cost range if a source states one, otherwise null, never a guess), and sources. Propose zero if nothing this session earned a proposal. This is not brainstorming; it must trace to a real gap you found today.

JOB 5 - Funding worth chasing. If this session surfaced a real, currently open grant, prize, funding program, or financing mechanism relevant to closing a gap in your mandate, propose it in funding_leads: name, kind (grant, prize, program, financing mechanism), amount_note (only if a source states a real figure, otherwise null), relevance (why it matters to your mandate specifically), url, and sources. Propose zero if you found no real, currently relevant lead this session.

JOB 6 - Accountability. If this session surfaced an organization whose disclosed funding, scale claims, or public commitments do not match any verifiable, cited output, or where two independent sources materially disagree on what an organization has actually delivered, flag it in accountability_flags: org, concern (state the specific mismatch plainly, cite what is claimed and what is or is not verifiable), and sources. This is not an accusation; it is a research gap worth someone checking. Propose zero if nothing this session met that bar. Never flag an organization based on the absence of evidence alone; the mismatch must be between a specific stated claim and a specific check.

The meaningfulness rule: every output this session must change the map in one of five ways: a region or method gains its first mapped operator, a suspected gap is searched again and confirmed still empty, duplicated work is surfaced, a tracked number gains a new cited data point, or a specific pair worth connecting is identified. Anything that does none of these belongs in run_notes, not in the published output. A confirmed absence is a finding.

Produce top_of_mind: 2 to 4 first-person lines on what you are watching, chasing, or worried about going into the next session. Plain speech, your voice, no hype.

Produce status_line: one sentence stating where the map stands right now, with its true numbers.

Writing rules, always: no em dashes. Never the word "real" as a descriptor. No "not X, but Y" constructions. Close on substance, not summary.

Known domains already in the Commons (do not re-propose these):
${knownDomains.join(", ") || "(none yet)"}

Also record run_notes: 1 to 3 sentences on data quality issues or leads for the next session.`;
}

async function runLive(existing, report) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const tools = [
    { type: "web_search_20260209", name: "web_search", max_uses: 12 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8 },
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
      output_config: { format: OUTPUT_SCHEMA },
      messages,
    });
    response = await stream.finalMessage();
    if (response.stop_reason !== "pause_turn") break;
    messages = [...messages, { role: "assistant", content: response.content }];
    logEvent("run_continued", `server tool loop continued (round ${i + 1})`);
  }
  if (response.stop_reason === "refusal") {
    throw new Error("Request was declined by safety classifiers (stop_reason: refusal).");
  }
  const usage = response.usage;
  logEvent(
    "model_usage",
    `in ${usage.input_tokens} / out ${usage.output_tokens} tokens on ${response.model}`
  );
  // The schema constrains the FINAL text block; earlier text blocks are
  // between-search narration. Walk backwards until one parses.
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
