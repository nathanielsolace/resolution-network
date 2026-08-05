#!/usr/bin/env node
// Generates each Resolver's COMMAND CENTER page from the registry.
// Page doctrine (2026-07-24 redesign):
//   1. The Report comes first: findings so far, the agent's own top of mind,
//      and the latest update, before any dossier material.
//   2. The research chain is explicit: signal -> baseline -> delta ->
//      interpret -> publish -> connect, in this Resolver's own terms.
//   3. Standing sources explain themselves: what each one is, why it is
//      watched, and how often this Commons has actually cited it.
//   4. The ledger states what it is for and what a visitor can do with it.
// Iron rule holds everywhere: every readout is generated from the public
// dataset and run log. Decorative motion is decorative; numbers are real.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LABS = path.resolve(HERE, "..");
const SITE = path.resolve(LABS, "..", "site");
const REGISTRY = JSON.parse(fs.readFileSync(path.join(LABS, "resolvers/registry.json"), "utf8"));

const outDir = path.join(SITE, "resolvers");
fs.mkdirSync(outDir, { recursive: true });

const asciiSafe = (s) => String(s).replace(/[^\x00-\x7F]/g, (c) => "&#" + c.codePointAt(0) + ";");

const FAVICON = (accent) =>
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='13' fill='none' stroke='%23${accent.slice(1)}' stroke-width='3'/%3E%3Ccircle cx='16' cy='16' r='5' fill='%23${accent.slice(1)}'/%3E%3C/svg%3E`;

// Identity sigils: one glyph per Resolver, drawn in its accent, same family.
const SIGIL_PATHS = {
  triton: '<path d="M4 12c2.5-3 5.5-3 8 0s5.5 3 8 0" fill="none" stroke-width="1.8" stroke-linecap="round"/><path d="M4 17c2.5-3 5.5-3 8 0s5.5 3 8 0" fill="none" stroke-width="1.8" stroke-linecap="round" opacity="0.55"/>',
  terra: '<path d="M12 20V9" fill="none" stroke-width="1.8" stroke-linecap="round"/><path d="M12 13c0-3.5 2.6-6 6-6 0 3.5-2.6 6-6 6z" fill="none" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 11c0-2.8-2-4.8-4.8-4.8 0 2.8 2 4.8 4.8 4.8z" fill="none" stroke-width="1.8" stroke-linejoin="round" opacity="0.55"/>',
  aether: '<path d="M4 9h10a2.5 2.5 0 1 0-2.5-2.5" fill="none" stroke-width="1.8" stroke-linecap="round"/><path d="M4 14h13a2.5 2.5 0 1 1-2.5 2.5" fill="none" stroke-width="1.8" stroke-linecap="round" opacity="0.75"/><path d="M4 19h7" fill="none" stroke-width="1.8" stroke-linecap="round" opacity="0.45"/>',
  ignis: '<path d="M12 4c1 3.5 5 5.5 5 9.5a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5.5.6 1.2 1.5 2 2.5 2.5C11.5 8 11.5 6 12 4z" fill="none" stroke-width="1.8" stroke-linejoin="round"/>',
  nereus: '<path d="M12 4c3 4 6 6.8 6 10a6 6 0 0 1-12 0c0-3.2 3-6 6-10z" fill="none" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 14.5c1.6-1.6 4.4-1.6 6 0" fill="none" stroke-width="1.6" stroke-linecap="round" opacity="0.6"/>',
};
const sigilSvg = (r, size) =>
  `<svg class="sigil-glyph" width="${size}" height="${size}" viewBox="0 0 24 24" stroke="${r.accent}" aria-hidden="true">${SIGIL_PATHS[r.id] || '<circle cx="12" cy="12" r="4" fill="' + r.accent + '" stroke="none"/>'}</svg>`;

function page(r) {
  const chain = r.chain || {};
  const chainSteps = [
    ["01", "Signal", "What new data means", chain.signal],
    ["02", "Baseline", "What it compares against", chain.baseline],
    ["03", "Delta", "What the comparison yields", chain.delta],
    ["04", "Interpret", "Why it matters, what it costs", chain.interpret],
    ["05", "Publish", "To the open record", chain.publish],
    ["06", "Connect", "The end it serves", chain.connect],
  ];

  const watches = (r.watches || [])
    .map(
      (w, i) => `<div class="src" data-src>
          <button class="src-row" type="button" aria-expanded="false">
            <span class="src-id">S${String(i + 1).padStart(2, "0")}</span>
            <span class="src-name">${asciiSafe(w.name)}</span>
            <span class="src-cite" data-cite="${i}"></span>
            <span class="src-chev">&#9662;</span>
          </button>
          <div class="src-body">
            <p><b>What it is.</b> ${asciiSafe(w.what)}</p>
            <p><b>Why ${r.name} watches it.</b> ${asciiSafe(w.why)}</p>
            ${w.url ? `<a class="src-link" href="${w.url}" rel="noopener" target="_blank">Visit the source &#8594;</a>` : ""}
          </div>
        </div>`
    )
    .join("\n        ");

  const tracking = (r.tracking || [])
    .map((t) => `<li>${asciiSafe(t)}</li>`)
    .join("\n          ");

  const recommissionNote = r.recommissioned
    ? `<div class="recomm"><span class="recomm-k">RECOMMISSIONED ${r.recommissioned.date}</span> ${asciiSafe(r.recommissioned.note)} <a href="/data/poseidon-organizations.json">The transferred dataset remains public</a>.</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${r.name} &#8212; ${asciiSafe(r.role)} &#8212; Resolution Network</title>
<meta name="description" content="${asciiSafe(r.one_liner)} Every readout on this screen is generated from the public dataset and run log.">
<link rel="canonical" href="https://resolutionnetwork.ai/resolvers/${r.id}.html">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/resolution.css">
<link rel="icon" href="${FAVICON(r.accent)}">
<style>
  body { --accent: ${r.accent}; --accent-soft: ${r.accent_soft}; background: #06070b; }
  .atmosphere { background:
    radial-gradient(1200px 560px at 82% -10%, ${r.accent_soft}, transparent 60%),
    radial-gradient(800px 500px at 6% 110%, rgba(232,234,242,0.025), transparent 60%),
    #06070b; }
  .atmosphere::before { content: ""; position: absolute; inset: 0; opacity: 0.5;
    background-image: linear-gradient(rgba(148,163,184,0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(148,163,184,0.045) 1px, transparent 1px);
    background-size: 44px 44px;
    mask-image: radial-gradient(1100px 700px at 50% 20%, #000, transparent 78%);
    -webkit-mask-image: radial-gradient(1100px 700px at 50% 20%, #000, transparent 78%); }

  /* ---------- human-first hero ---------- */
  .rhero { position: relative; overflow: hidden; }
  .rhero-grid { display: grid; grid-template-columns: 1.35fr 1fr; gap: 26px; align-items: start; }
  @media (max-width: 1020px) { .rhero-grid { grid-template-columns: 1fr; } }
  .rhero-orb-field { position: absolute; top: -120px; right: -120px; width: 480px; height: 480px;
    pointer-events: none; z-index: 0; opacity: 0.9; }
  .orb { position: absolute; inset: 90px; border-radius: 50%;
    background: radial-gradient(circle at 34% 28%, color-mix(in srgb, var(--accent) 92%, #fff) 0%, var(--accent) 32%,
      color-mix(in srgb, var(--accent) 38%, #06070b) 68%, #06070b 100%);
    box-shadow: 0 0 120px var(--accent-soft), inset -18px -18px 60px rgba(0,0,0,0.45);
    animation: orb-breathe 7s ease-in-out infinite; }
  @keyframes orb-breathe { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.12); } }
  .orb-ring { position: absolute; inset: 60px; border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); animation: sigil-spin 26s linear infinite; }
  .orb-ring.r2 { inset: 30px; border-color: color-mix(in srgb, var(--accent) 18%, transparent); animation-duration: 40s; animation-direction: reverse; }
  .breadcrumb { position: relative; font-family: var(--font-mono); font-size: 11.5px; letter-spacing: 0.12em;
    color: var(--text-faint); text-decoration: none; display: inline-block; margin-bottom: 20px; }
  .breadcrumb:hover { color: var(--text-dim); }
  .rid-row { position: relative; display: flex; align-items: center; gap: 16px; }
  .rid-orb { width: 56px; height: 56px; border-radius: 50%; flex: none; position: relative;
    background: radial-gradient(circle at 32% 28%, color-mix(in srgb, var(--accent) 90%, #fff), var(--accent) 55%, color-mix(in srgb, var(--accent) 30%, #06070b) 100%);
    box-shadow: 0 0 30px var(--accent-soft); }
  .rid-name { font-family: var(--font-display); font-weight: 800; font-size: clamp(30px, 4vw, 46px); letter-spacing: 0.03em; }
  .rid-role { position: relative; color: var(--accent); font-weight: 700; font-size: 16.5px; margin-top: 10px; }
  .rid-lede { position: relative; margin-top: 14px; color: var(--text-dim); font-size: 15.5px; max-width: 560px; line-height: 1.7; }
  .rid-drive { position: relative; margin-top: 12px; font-size: 13px; color: var(--text-dim); font-style: italic;
    border-left: 2px solid var(--accent); padding-left: 12px; max-width: 540px; line-height: 1.6; }
  .rid-status { position: relative; display: flex; align-items: center; gap: 14px; margin-top: 22px; flex-wrap: wrap; }
  .live-badge { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 700;
    color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); border-radius: 999px; padding: 5px 13px; }
  .live-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 8px var(--accent); animation: pulse-dot 2.2s ease-in-out infinite; }
  .rid-updated { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-faint); }
  .rid-quickstats { position: relative; display: flex; gap: 30px; margin-top: 22px; flex-wrap: wrap; }
  .qs .n { font-family: var(--font-mono); font-weight: 700; font-size: 26px; color: var(--text); }
  .qs .l { font-size: 12px; color: var(--text-dim); margin-top: 2px; }
  .rid-ctas { position: relative; display: flex; gap: 10px; margin-top: 24px; flex-wrap: wrap; }
  .rid-ctas button, .rid-ctas a { font-family: var(--font-body); }
  .btn-talk { background: var(--accent); color: #06070b; border: none; border-radius: 999px; font-weight: 700;
    font-size: 14.5px; padding: 12px 22px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
    transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s, filter 0.2s; }
  .btn-talk:hover, .btn-talk:focus-visible { transform: translateY(-2px); box-shadow: var(--lift-shadow); filter: brightness(1.08); }
  .btn-ghost { background: none; color: var(--text-dim); border: 1px solid var(--line); border-radius: 999px;
    font-size: 14.5px; padding: 12px 22px; text-decoration: none; display: inline-flex; align-items: center; gap: 8px;
    transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s, border-color 0.2s, color 0.2s; }
  .btn-ghost:hover, .btn-ghost:focus-visible { border-color: var(--accent); color: var(--text); transform: translateY(-2px); box-shadow: var(--lift-shadow); }

  /* ---------- key findings row ---------- */
  .kf-row { position: relative; display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-top: 30px; }
  .kf-card { border: 1px solid var(--line); border-radius: 10px; background: rgba(7,8,13,0.6); padding: 15px 16px; }
  .kf-card .kf-icon { width: 30px; height: 30px; border-radius: 8px; background: var(--accent-soft); display: grid; place-items: center; margin-bottom: 10px;
    font-family: var(--font-mono); font-size: 11px; font-weight: 600; color: var(--accent); }
  .kf-card h4 { font-family: var(--font-display); font-size: 13.5px; font-weight: 700; line-height: 1.35; margin-bottom: 6px; }
  .kf-card p { font-size: 12px; color: var(--text-dim); line-height: 1.55; }

  /* ---------- chat panel ---------- */
  .chat-panel { position: relative; border: 1px solid var(--line); border-radius: 12px;
    background: linear-gradient(180deg, rgba(18,19,30,0.94), rgba(11,12,19,0.94)); display: flex; flex-direction: column;
    max-height: 640px; overflow: hidden; }
  .chat-head { display: flex; align-items: center; gap: 10px; padding: 16px 18px; border-bottom: 1px solid var(--line); }
  .chat-head .co { width: 26px; height: 26px; border-radius: 50%; flex: none;
    background: radial-gradient(circle at 32% 28%, color-mix(in srgb, var(--accent) 90%, #fff), var(--accent) 60%, color-mix(in srgb, var(--accent) 25%, #06070b)); }
  .chat-head b { font-family: var(--font-display); font-size: 14.5px; font-weight: 700; }
  .chat-head .live-badge { margin-left: auto; padding: 3px 10px; font-size: 10.5px; }
  .chat-body { flex: 1; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; min-height: 220px; }
  .chat-msg { max-width: 88%; font-size: 13.5px; line-height: 1.6; border-radius: 11px; padding: 10px 13px; }
  .chat-msg.you { align-self: flex-end; background: rgba(148,163,184,0.1); color: var(--text); }
  .chat-msg.bot { align-self: flex-start; background: var(--accent-soft); border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent); color: var(--text-dim); }
  .chat-msg.bot b { color: var(--accent); display: block; font-size: 10.5px; letter-spacing: 0.1em; margin-bottom: 4px; font-family: var(--font-mono); }
  .chat-msg .csrc { margin-top: 7px; display: flex; flex-wrap: wrap; gap: 5px; }
  .chat-msg .csrc a { font-family: var(--font-mono); font-size: 10px; color: var(--text-faint); text-decoration: none;
    border: 1px solid var(--line-soft); border-radius: 5px; padding: 2px 6px; }
  .chat-msg .csrc a:hover { color: var(--accent); border-color: var(--accent); }
  .chat-prompts { padding: 12px 18px; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 7px; }
  .chat-chip { background: none; border: 1px solid var(--line); color: var(--text-dim); border-radius: 999px;
    font-size: 12px; padding: 7px 13px; cursor: pointer; font-family: var(--font-body);
    transition: border-color 0.2s, color 0.2s, transform 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s; }
  .chat-chip:hover, .chat-chip:focus-visible { border-color: var(--accent); color: var(--text); transform: translateY(-1px); box-shadow: var(--lift-shadow); }
  .chat-chip:disabled { opacity: 0.35; cursor: default; }
  .chat-foot { padding: 10px 18px 14px; font-size: 10.5px; color: var(--text-faint); border-top: 1px solid var(--line-soft); }

  /* ---------- telemetry 8 ---------- */
  .tele8 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  @media (max-width: 900px) { .tele8 { grid-template-columns: repeat(2, 1fr); } }

  /* ---------- coverage by region ---------- */
  .cov-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
  .cov-name { font-size: 12.5px; color: var(--text-dim); width: 150px; flex: none; }
  .cov-track { flex: 1; height: 8px; border-radius: 4px; background: rgba(148,163,184,0.09); overflow: hidden; }
  .cov-bar { height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 55%, transparent)); }
  .cov-pct { font-family: var(--font-mono); font-size: 11.5px; color: var(--text); width: 38px; text-align: right; flex: none; }

  /* ---------- research feed lists (hardware / funding / flags) ---------- */
  .feed-item { border-top: 1px solid var(--line-soft); padding: 12px 0; }
  .feed-item:first-child { border-top: none; padding-top: 0; }
  .feed-item .fk { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; color: var(--accent); }
  .feed-item h5 { font-family: var(--font-display); font-size: 13.5px; margin: 4px 0 4px; }
  .feed-item p { font-size: 12.5px; color: var(--text-dim); line-height: 1.6; }
  .feed-item .fn { font-family: var(--font-mono); font-size: 11px; color: var(--text-faint); margin-top: 4px; }

  /* ---------- collapsible detail ---------- */
  details.detail-block { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); }
  details.detail-block summary { list-style: none; cursor: pointer; padding: 18px 24px; display: flex; align-items: center; gap: 10px; }
  details.detail-block summary::-webkit-details-marker { display: none; }
  details.detail-block summary .stick { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
  details.detail-block summary .st { font-family: var(--font-display); font-weight: 700; font-size: 15px; }
  details.detail-block summary .sn { margin-left: auto; font-family: var(--font-mono); font-size: 11px; color: var(--text-faint); }
  details.detail-block summary .sc { color: var(--text-faint); transition: transform 0.2s; }
  details.detail-block[open] summary .sc { transform: rotate(180deg); }
  details.detail-block .detail-inner { padding: 6px 24px 26px; display: grid; grid-template-columns: repeat(12, 1fr); gap: 14px; }
  details.detail-block .detail-inner .hud { border: 1px solid var(--line-soft); }

  /* ---------- ops bar ---------- */
  .ops-bar { position: sticky; top: 0; z-index: 60; border-bottom: 1px solid var(--line);
    background: rgba(6,7,11,0.9); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
  .ops-bar-inner { max-width: 1360px; margin: 0 auto; padding: 11px 24px;
    display: flex; align-items: center; gap: 15px; }
  .ops-home { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text);
    flex: none; padding: 4px 2px; border-radius: 8px; transition: opacity 0.2s; }
  .ops-home:hover { opacity: 0.75; }
  .ops-home-word { font-family: var(--font-display); font-weight: 700; font-size: 14px; letter-spacing: -0.01em; white-space: nowrap; }
  @media (max-width: 760px) { .ops-home-word { display: none; } }
  .ops-divider { width: 1px; height: 26px; background: var(--line); flex: none; }
  .ops-sigil { width: 40px; height: 40px; border-radius: 50%; border: 1.5px solid color-mix(in srgb, var(--accent) 55%, transparent);
    display: grid; place-items: center; flex: none; position: relative; }
  .ops-sigil::before { content: ""; position: absolute; inset: -1.5px; border-radius: 50%;
    border: 1.5px solid transparent; border-top-color: var(--accent); animation: sigil-spin 14s linear infinite; }
  @keyframes sigil-spin { to { transform: rotate(360deg); } }
  .ops-id .n { font-family: var(--font-display); font-weight: 800; font-size: 17px; letter-spacing: 0.06em; }
  .ops-id .r { font-size: 12px; color: var(--accent); font-weight: 600; margin-top: 1px; }
  .ops-live-link { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.12em; color: var(--text-faint);
    text-decoration: none; border: 1px solid var(--line); border-radius: 999px; padding: 6px 12px; white-space: nowrap; }
  .ops-live-link:hover { color: var(--text); border-color: var(--text-dim); }
  .ops-meta { margin-left: auto; display: flex; align-items: center; gap: 18px; }
  .ops-chip { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.14em; color: var(--text-faint); }
  .ops-chip b { color: var(--text-dim); font-weight: 500; }
  .ops-clock { font-family: var(--font-mono); font-size: 13px; color: var(--text); letter-spacing: 0.08em; }
  .ops-follow { text-decoration: none; font-weight: 700; font-size: 13px; color: #06070b;
    background: var(--accent); padding: 8px 16px; border-radius: 999px; }
  @media (max-width: 900px) { .ops-chip.hide-sm { display: none; } }

  /* ---------- deck ---------- */
  .deck { max-width: 1360px; margin: 0 auto; padding: 26px 24px 80px;
    display: grid; grid-template-columns: repeat(12, 1fr); gap: 14px; }
  .hud { position: relative; border: 1px solid var(--line); border-radius: 10px;
    background: linear-gradient(180deg, rgba(18,19,30,0.92), rgba(11,12,19,0.92));
    padding: 20px 22px; overflow: hidden; }
  .hud::before, .hud::after { content: ""; position: absolute; width: 14px; height: 14px; pointer-events: none; }
  .hud::before { top: -1px; left: -1px; border-top: 2px solid var(--accent); border-left: 2px solid var(--accent);
    border-top-left-radius: 10px; opacity: 0.9; }
  .hud::after { bottom: -1px; right: -1px; border-bottom: 2px solid var(--accent); border-right: 2px solid var(--accent);
    border-bottom-right-radius: 10px; opacity: 0.5; }
  .hud-label { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.24em;
    text-transform: uppercase; color: var(--text-faint); display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .hud-label .tick { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 10px var(--accent); flex: none; }
  .hud-label .right { margin-left: auto; letter-spacing: 0.1em; color: var(--text-faint); text-align: right; }
  .span-12 { grid-column: span 12; } .span-8 { grid-column: span 8; } .span-7 { grid-column: span 7; }
  .span-6 { grid-column: span 6; } .span-5 { grid-column: span 5; } .span-4 { grid-column: span 4; }
  @media (max-width: 1020px) { .deck > .hud { grid-column: span 12 !important; } }

  /* ---------- the report (first screen) ---------- */
  .report-head { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }
  .report-title { font-family: var(--font-display); font-weight: 800; font-size: clamp(22px, 2.6vw, 32px); letter-spacing: 0.02em; }
  .report-title em { font-style: normal; color: var(--accent); }
  .report-stamp { font-family: var(--font-mono); font-size: 11px; color: var(--text-faint); letter-spacing: 0.12em; }
  .report-premise { margin-top: 10px; color: var(--text-dim); font-size: 15.5px; max-width: 860px; line-height: 1.65; }
  .report-status { margin-top: 14px; font-family: var(--font-mono); font-size: 13.5px; color: var(--text);
    border-left: 2px solid var(--accent); padding: 6px 0 6px 14px; }
  .report-status .cursor { display: inline-block; width: 7px; height: 13px; background: var(--accent);
    vertical-align: -2px; margin-left: 6px; animation: blink 1.1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .report-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 26px; margin-top: 22px; }
  @media (max-width: 900px) { .report-grid { grid-template-columns: 1fr; } }
  .report-h { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.22em; text-transform: uppercase;
    color: var(--text-faint); margin-bottom: 12px; display: flex; align-items: center; gap: 9px; }
  .report-h .tick { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }
  .finding { display: flex; gap: 12px; padding: 11px 0; border-top: 1px solid var(--line-soft); font-size: 14px; }
  .finding:first-of-type { border-top: none; padding-top: 0; }
  .finding .fi { font-family: var(--font-mono); font-size: 10.5px; color: var(--accent); padding-top: 3px; flex: none; width: 24px; }
  .finding .ft { color: var(--text-dim); line-height: 1.65; }
  .finding .fs { margin-top: 5px; }
  .finding .fs a { font-family: var(--font-mono); font-size: 10.5px; color: var(--text-faint); text-decoration: none;
    border: 1px solid var(--line-soft); border-radius: 5px; padding: 2px 7px; margin-right: 6px; display: inline-block; margin-top: 3px; }
  .finding .fs a:hover { color: var(--accent); border-color: var(--accent); }
  .mind { border: 1px solid var(--line); border-radius: 9px; background: rgba(7,8,13,0.6); padding: 15px 16px; margin-bottom: 10px; position: relative; }
  .mind::before { content: ""; position: absolute; left: 0; top: 12px; bottom: 12px; width: 2px; background: var(--accent); border-radius: 2px; }
  .mind p { font-size: 13.5px; color: var(--text-dim); line-height: 1.65; padding-left: 12px; }
  .mind-sig { font-family: var(--font-mono); font-size: 10px; color: var(--text-faint); letter-spacing: 0.14em; padding-left: 12px; margin-top: 7px; }

  /* ---------- latest update ---------- */
  .update { margin-top: 24px; border-top: 1px solid var(--line); padding-top: 18px; }
  .update-head { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }
  .update-title { font-family: var(--font-display); font-weight: 700; font-size: 18px; }
  .update-date { font-family: var(--font-mono); font-size: 11px; color: var(--text-faint); letter-spacing: 0.1em; }
  .update-points { margin: 13px 0 0; list-style: none; }
  .update-points li { display: flex; gap: 10px; font-size: 14px; color: var(--text-dim); padding: 5px 0; line-height: 1.6; }
  .update-points li::before { content: "\\25B8"; color: var(--accent); flex: none; font-size: 12px; padding-top: 2px; }
  .update-body { margin-top: 14px; max-height: 0; overflow: hidden; transition: max-height 0.5s ease; }
  .update-body.open { max-height: 3000px; }
  .update-body p { color: var(--text-dim); font-size: 14px; line-height: 1.8; margin-bottom: 13px; max-width: 780px; }
  .update-toggle { margin-top: 12px; background: none; border: 1px solid var(--line); color: var(--text-dim);
    font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.12em; padding: 8px 16px; border-radius: 999px; cursor: pointer; }
  .update-toggle:hover { border-color: var(--accent); color: var(--text); }
  .update-srcs { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 6px; }
  .update-srcs a { font-family: var(--font-mono); font-size: 10.5px; color: var(--text-faint); text-decoration: none;
    border: 1px solid var(--line-soft); border-radius: 5px; padding: 3px 8px; }
  .update-srcs a:hover { color: var(--accent); border-color: var(--accent); }
  .update-log { margin-top: 16px; font-family: var(--font-mono); font-size: 11px; color: var(--text-faint); letter-spacing: 0.06em; }
  .update-log b { color: var(--text-dim); font-weight: 500; }
  .recomm { margin-top: 18px; border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line)); border-radius: 9px;
    background: var(--accent-soft); padding: 13px 16px; font-size: 13px; color: var(--text-dim); line-height: 1.65; }
  .recomm-k { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.16em; color: var(--accent); display: block; margin-bottom: 5px; }
  .recomm a { color: var(--text-dim); }

  /* ---------- telemetry ---------- */
  .tele-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .tele { border: 1px solid var(--line); border-radius: 9px; padding: 16px 16px 13px;
    background: rgba(7,8,13,0.65); position: relative; overflow: hidden; }
  .tele::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
    background: linear-gradient(90deg, var(--accent), transparent 70%); opacity: 0.7; }
  .tele .n { font-family: var(--font-mono); font-weight: 600; font-size: clamp(26px, 2.6vw, 36px); letter-spacing: -0.02em; }
  .tele .l { font-size: 11.5px; color: var(--text-dim); margin-top: 3px; }
  .tele .d { font-family: var(--font-mono); font-size: 10px; color: var(--text-faint); margin-top: 7px; letter-spacing: 0.08em; }

  /* ---------- mandate (clear, identity-first spec) ---------- */
  .mandate-lead { font-family: var(--font-display); font-weight: 700; font-size: clamp(18px, 1.9vw, 24px); line-height: 1.35; letter-spacing: -0.01em; }
  .mandate-q { margin-top: 13px; border-left: 2px solid var(--accent); padding: 3px 0 3px 14px;
    color: var(--text-dim); font-style: italic; font-size: 14.5px; }
  .mandate-tracks { margin: 18px 0 0; list-style: none; }
  .mandate-tracks li { display: flex; gap: 11px; padding: 8px 0; font-size: 14px; color: var(--text-dim); line-height: 1.6;
    border-top: 1px solid var(--line-soft); }
  .mandate-tracks li::before { content: ""; width: 7px; height: 7px; border-radius: 2px; background: var(--accent); flex: none; margin-top: 7px; }
  .drive { margin-top: 16px; border: 1px solid color-mix(in srgb, var(--accent) 32%, var(--line)); border-radius: 9px;
    background: var(--accent-soft); padding: 14px 16px; }
  .drive-k { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.16em; color: var(--accent); margin-bottom: 6px; }
  .drive p { font-size: 13.5px; color: var(--text); line-height: 1.7; font-style: italic; }
  .spec { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 0 26px; }
  @media (max-width: 720px) { .spec { grid-template-columns: 1fr; } }
  .spec-row { padding: 10px 0; border-top: 1px solid var(--line-soft); }
  .spec-k { font-size: 12px; font-weight: 600; color: var(--accent); letter-spacing: 0.02em; }
  .spec-v { font-size: 13.5px; color: var(--text-dim); margin-top: 3px; line-height: 1.6; }

  /* ---------- research chain ---------- */
  .chain { display: flex; flex-direction: column; }
  .chain-step { display: grid; grid-template-columns: 34px 148px 1fr; gap: 14px; padding: 12px 0;
    border-top: 1px solid var(--line-soft); align-items: start; }
  .chain-step:first-child { border-top: none; padding-top: 2px; }
  .chain-num { font-family: var(--font-mono); font-size: 11px; color: var(--accent); letter-spacing: 0.1em; padding-top: 3px;
    position: relative; }
  .chain-num::after { content: ""; position: absolute; left: 7px; top: 22px; bottom: -14px; width: 1px;
    background: color-mix(in srgb, var(--accent) 30%, transparent); }
  .chain-step:last-child .chain-num::after { display: none; }
  .chain-name { padding-top: 1px; }
  .chain-name b { font-family: var(--font-display); font-size: 14px; font-weight: 700; display: block; }
  .chain-name span { font-size: 11px; color: var(--text-faint); display: block; margin-top: 1px; line-height: 1.45; }
  .chain-text { font-size: 13.5px; color: var(--text-dim); line-height: 1.65; }
  @media (max-width: 720px) { .chain-step { grid-template-columns: 30px 1fr; } .chain-text { grid-column: 2; } }

  /* ---------- standing sources ---------- */
  .src { border-top: 1px solid var(--line-soft); }
  .src:first-of-type { border-top: none; }
  .src-row { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 0; background: none; border: none;
    color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .src-id { font-family: var(--font-mono); font-size: 10px; color: var(--text-faint); width: 26px; flex: none; }
  .src-name { font-size: 13px; color: var(--text); flex: 1; min-width: 0; font-weight: 500; }
  .src-cite { font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.08em; color: var(--text-faint);
    border: 1px solid var(--line-soft); border-radius: 999px; padding: 2px 8px; white-space: nowrap; }
  .src-cite.cited { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  .src-chev { color: var(--text-faint); font-size: 11px; transition: transform 0.25s; flex: none; }
  .src[data-open] .src-chev { transform: rotate(180deg); }
  .src-body { max-height: 0; overflow: hidden; transition: max-height 0.35s ease; }
  .src[data-open] .src-body { max-height: 320px; }
  .src-body p { font-size: 12.5px; color: var(--text-dim); line-height: 1.65; margin: 0 0 8px; padding-right: 6px; }
  .src-body p b { color: var(--text); font-weight: 600; }
  .src-body { padding-left: 36px; }
  .src-body p:first-child { margin-top: 2px; }
  .src-link { font-family: var(--font-mono); font-size: 11px; color: var(--accent); text-decoration: none; display: inline-block; margin-bottom: 12px; }

  /* ---------- methods + coverage ---------- */
  .cc-method-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; }
  .cc-method-name { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-dim); width: 168px; flex: none;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cc-method-bar-track { flex: 1; height: 9px; border-radius: 5px; background: rgba(148,163,184,0.09); overflow: hidden; }
  .cc-method-bar { height: 100%; border-radius: 5px; background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 55%, transparent));
    box-shadow: 0 0 12px var(--accent-soft); min-width: 3px; transition: width 0.8s cubic-bezier(0.2, 0.8, 0.2, 1); }
  .cc-method-n { font-family: var(--font-mono); font-size: 11.5px; color: var(--text); width: 28px; text-align: right; flex: none; }
  .region-grid { display: flex; flex-wrap: wrap; gap: 7px; }
  .region-chip { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--line);
    border-radius: 6px; padding: 6px 10px; font-size: 11.5px; color: var(--text-dim); background: rgba(7,8,13,0.55); }
  .region-chip b { font-family: var(--font-mono); color: var(--accent); font-weight: 600; }

  /* ---------- terminal ---------- */
  .term { font-family: var(--font-mono); font-size: 12px; line-height: 1.75; max-height: 280px; overflow-y: auto; }
  .term-line { display: flex; gap: 10px; padding: 2px 0; }
  .term-ts { color: var(--text-faint); flex: none; }
  .term-type { color: var(--accent); flex: none; min-width: 110px; }
  .term-msg { color: var(--text-dim); overflow-wrap: anywhere; }
  .term-empty { color: var(--text-faint); font-style: italic; }

  /* ---------- ledger ---------- */
  .ledger-purpose { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-bottom: 16px; }
  @media (max-width: 820px) { .ledger-purpose { grid-template-columns: 1fr; } }
  .ledger-purpose p { font-size: 13px; color: var(--text-dim); line-height: 1.65; }
  .ledger-purpose b { color: var(--text); font-weight: 600; display: block; margin-bottom: 3px; font-size: 12.5px; }
  .ledger-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .ledger-actions a { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em; color: var(--text-dim);
    text-decoration: none; border: 1px solid var(--line); border-radius: 999px; padding: 7px 14px; }
  .ledger-actions a:hover { color: var(--accent); border-color: var(--accent); }
  .ledger-tools { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
  .ledger-search { flex: 1; min-width: 220px; background: rgba(7,8,13,0.75); border: 1px solid var(--line);
    border-radius: 8px; padding: 9px 14px; color: var(--text); font-family: var(--font-mono); font-size: 12.5px; outline: none; }
  .ledger-search:focus { border-color: var(--accent); }
  .ledger-count { font-family: var(--font-mono); font-size: 11px; color: var(--text-faint); letter-spacing: 0.1em; }
  .cc-table-scroll { overflow: auto; max-height: 430px; border: 1px solid var(--line); border-radius: 9px; }
  table.cc-ledger { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 780px; }
  table.cc-ledger th { position: sticky; top: 0; z-index: 2; text-align: left; font-family: var(--font-mono);
    font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-faint);
    padding: 10px 14px; background: #0d0e16; border-bottom: 1px solid var(--line); }
  table.cc-ledger td { padding: 9px 14px; border-bottom: 1px solid var(--line-soft); color: var(--text-dim); }
  table.cc-ledger td:first-child { color: var(--text); font-weight: 500; }
  table.cc-ledger tr:hover td { background: rgba(148,163,184,0.045); }
  table.cc-ledger a { color: var(--text-faint); }
  table.cc-ledger a:hover { color: var(--accent); }
  .m-chip { font-family: var(--font-mono); font-size: 10px; padding: 2px 8px; border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line)); color: var(--accent); white-space: nowrap; }

  /* ---------- funnel + follow ---------- */
  .cc-funnel { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .cc-funnel .cell { text-align: center; border: 1px solid var(--line-soft); border-radius: 8px; padding: 13px 4px; background: rgba(7,8,13,0.55); }
  .cc-funnel .n { font-family: var(--font-mono); font-size: 20px; font-weight: 600; }
  .cc-funnel .l { font-size: 10.5px; color: var(--text-dim); margin-top: 2px; }
  .truth-foot { grid-column: span 12; font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.12em;
    color: var(--text-faint); text-transform: uppercase; text-align: center; padding-top: 6px; }
  body.stream .ops-bar .ops-follow { display: none; }
</style>
</head>
<body>
<div class="atmosphere"></div>

<div class="ops-bar">
  <div class="ops-bar-inner">
    <a class="ops-home" href="/" aria-label="Resolution Network home">
      <span class="aperture" style="width:20px;height:20px;"></span>
      <span class="ops-home-word">RESOLUTION NETWORK</span>
    </a>
    <span class="ops-divider" aria-hidden="true"></span>
    <span class="ops-sigil">${sigilSvg(r, 22)}</span>
    <div class="ops-id">
      <div class="n">${r.name}</div>
      <div class="r">${asciiSafe(r.role)}</div>
    </div>
    <div class="ops-meta">
      <span class="ops-chip hide-sm">${r.designation}</span>
      <span class="ops-chip hide-sm">ENGINE <b>CLAUDE SONNET 5</b></span>
      <span class="ops-chip" id="ops-status">STATUS <b id="ops-status-v">&#8230;</b></span>
      <a class="ops-live-link hide-sm" href="/live.html">LIVE VIEW</a>
      <span class="ops-clock" id="clock">--:--:-- UTC</span>
      <a class="ops-follow" href="#follow">Follow</a>
    </div>
  </div>
</div>

<main class="deck">

  <section class="rhero span-12">
    <div class="rhero-orb-field" aria-hidden="true"><div class="orb"></div><div class="orb-ring"></div><div class="orb-ring r2"></div></div>
    <div class="rhero-grid">
      <div>
        <a class="breadcrumb" href="/#resolvers">&#8592; ALL RESOLVERS</a>
        <div class="rc-desig" style="position:relative;">${r.designation}</div>
        <div class="rid-row">
          <span class="rid-orb" aria-hidden="true"></span>
          <span class="rid-name">${r.name}</span>
        </div>
        <div class="rid-role">${asciiSafe(r.role)}</div>
        <p class="rid-lede">${asciiSafe(r.one_liner)}</p>
        ${r.drive ? `<p class="rid-drive">${asciiSafe(r.drive)}</p>` : ""}
        <div class="rid-status">
          <span class="live-badge"><span class="dot"></span><span id="ops-status-v2">&#8230;</span></span>
          <span class="rid-updated" id="report-stamp"></span>
        </div>
        <div class="rid-quickstats">
          <div class="qs"><div class="n" id="s-orgs">&#8211;</div><div class="l">orgs mapped</div></div>
          <div class="qs"><div class="n" id="s-countries">&#8211;</div><div class="l">countries</div></div>
          <div class="qs"><div class="n" id="s-briefs">&#8211;</div><div class="l">updates</div></div>
        </div>
        <div class="rid-ctas">
          <button class="btn-talk" type="button" onclick="document.getElementById('chat-panel').scrollIntoView({behavior:'smooth',block:'center'})">&#128172; Talk to ${r.name}</button>
          <a class="btn-ghost" href="#detail" onclick="document.getElementById('detail-block').open=true;">View research detail</a>
          <a class="btn-ghost" href="/data/${r.id}-organizations.json" download>Download the ledger</a>
        </div>
        <div class="kf-row" id="kf-row"></div>
      </div>

      <div class="chat-panel" id="chat-panel">
        <div class="chat-head">
          <span class="co" aria-hidden="true"></span>
          <b>Chat with ${r.name}</b>
          <span class="live-badge"><span class="dot"></span>LIVE</span>
        </div>
        <div class="chat-body" id="chat-body">
          <p class="term-empty" style="font-size:12.5px;">${r.name} reports in after its first research session. Standing question until then: <em>${asciiSafe(r.first_question)}</em></p>
        </div>
        <div class="chat-prompts" id="chat-prompts"></div>
        <div class="chat-foot">Answers are compiled from ${r.name}'s own published findings and Commons data, not generated live. Every cited claim links to its source.</div>
      </div>
    </div>
  </section>

  <section class="hud span-12">
    <div class="hud-label"><span class="tick"></span>Live telemetry<span class="right" id="tele-stamp"></span></div>
    <div class="tele8">
      <div class="tele"><div class="n" id="s-orgs2">&#8211;</div><div class="l">organizations mapped</div><div class="d">COMMONS RECORDS</div></div>
      <div class="tele"><div class="n" id="s-countries2">&#8211;</div><div class="l">headquarters countries</div><div class="d">HQ SPREAD</div></div>
      <div class="tele"><div class="n" id="s-sources">&#8211;</div><div class="l">source citations</div><div class="d">VERIFIABILITY</div></div>
      <div class="tele"><div class="n" id="s-briefs2">&#8211;</div><div class="l">report updates</div><div class="d">PUBLISHED</div></div>
      <div class="tele"><div class="n" id="s-intros">&#8211;</div><div class="l">introductions drafted</div><div class="d">CONNECTION ENGINE</div></div>
      <div class="tele"><div class="n" id="s-hardware">&#8211;</div><div class="l">hardware / software proposed</div><div class="d">BUILD LEADS</div></div>
      <div class="tele"><div class="n" id="s-funding">&#8211;</div><div class="l">funding leads flagged</div><div class="d">MONEY WORTH CHASING</div></div>
      <div class="tele"><div class="n" id="s-flags">&#8211;</div><div class="l">accountability flags</div><div class="d">WORTH A CLOSER LOOK</div></div>
    </div>
  </section>

  <section class="hud span-7">
    <div class="hud-label"><span class="tick"></span>Coverage by region<span class="right">SHARE OF THE MAPPED COMMONS</span></div>
    <div id="coverage"><p class="term-empty" style="font-size:12.5px;">Awaiting the first mapped records.</p></div>
  </section>

  <section class="hud span-5">
    <div class="hud-label"><span class="tick"></span>Connection engine<span class="right">CONSENT-FIRST</span></div>
    <div class="cc-funnel">
      <div class="cell"><div class="n" id="cx-proposed">0</div><div class="l">proposed</div></div>
      <div class="cell"><div class="n" id="cx-approved">0</div><div class="l">approved</div></div>
      <div class="cell"><div class="n" id="cx-sent">0</div><div class="l">sent</div></div>
      <div class="cell"><div class="n" id="cx-connected">0</div><div class="l">connected</div></div>
    </div>
    <div id="cx-confirmed"></div>
    <p style="font-size:11.5px;color:var(--text-faint);margin-top:12px;line-height:1.6;">${r.name} drafts introductions, cites them claim by claim, and a human approves each one before anything sends. Who is being introduced stays private until both organizations confirm.</p>
  </section>

  <details class="detail-block span-12" id="detail-block">
    <summary><span class="stick"></span><span class="st">Full research detail</span><span class="sn">Mandate, chain, standing sources, method distribution, full ledger, hardware and funding leads, run log</span><span class="sc">&#9662;</span></summary>
    <div class="detail-inner">

  <section class="hud span-12">
    <div class="hud-label"><span class="tick"></span>The ${r.name} Report<span class="right">ONE STANDING DOCUMENT &#183; UPDATED EVERY RESEARCH SESSION</span></div>
    <p class="report-premise"><b style="color:var(--text);">The premise:</b> ${asciiSafe(r.report.premise)}</p>
    <div class="report-status" id="report-status" hidden><span id="report-status-t"></span><span class="cursor"></span></div>
    ${recommissionNote}
    <div class="report-grid">
      <div>
        <div class="report-h"><span class="tick"></span>What ${r.name} has found so far</div>
        <div id="findings"><p class="term-empty" style="font-size:13px;">The first findings publish the moment the commissioning research session completes. Nothing appears here before the work happens.</p></div>
      </div>
      <div>
        <div class="report-h"><span class="tick"></span>Top of mind &#183; in ${r.name}'s words</div>
        <div id="mind"><p class="term-empty" style="font-size:13px;">${r.name} reports in after its first session. Its standing question until then: <em>${asciiSafe(r.first_question)}</em></p></div>
      </div>
    </div>
    <div class="update" id="update-wrap" hidden>
      <div class="report-h"><span class="tick"></span>Latest report update</div>
      <div class="update-head">
        <span class="update-title" id="update-title"></span>
        <span class="update-date" id="update-date"></span>
      </div>
      <ul class="update-points" id="update-points"></ul>
      <div class="update-body" id="update-body"></div>
      <button class="update-toggle" type="button" id="update-toggle">READ THE FULL UPDATE</button>
      <div class="update-srcs" id="update-srcs"></div>
      <div class="update-log" id="update-log"></div>
    </div>
  </section>

  <section class="hud span-7">
    <div class="hud-label"><span class="tick"></span>Mandate<span class="right">${r.designation} &#183; ${asciiSafe(r.domain).toUpperCase()}</span></div>
    <div class="mandate-lead">${asciiSafe(r.one_liner)}</div>
    <div class="mandate-q">"${asciiSafe(r.first_question)}"</div>
    <ul class="mandate-tracks">
          ${tracking}
    </ul>
    <div class="spec">
      <div class="spec-row"><div class="spec-k">Three year target</div><div class="spec-v">${asciiSafe(r.three_year_target)}</div></div>
      <div class="spec-row"><div class="spec-k">Character</div><div class="spec-v">${asciiSafe(r.voice_note)}</div></div>
      <div class="spec-row"><div class="spec-k">Publishes</div><div class="spec-v">Cited organization records to the Commons, updates to the ${r.name} Report, and human-approved introductions between organizations.</div></div>
      <div class="spec-row"><div class="spec-k">Mandate since</div><div class="spec-v">${r.mandate_start}</div></div>
    </div>
  </section>

  <section class="hud span-5">
    <div class="hud-label"><span class="tick"></span>The research chain<span class="right">HOW A SESSION THINKS</span></div>
    <div class="chain">
      ${chainSteps.map(([n, name, sub, text]) => `<div class="chain-step"><span class="chain-num">${n}</span><span class="chain-name"><b>${name}</b><span>${sub}</span></span><span class="chain-text">${asciiSafe(text || "")}</span></div>`).join("\n      ")}
    </div>
  </section>

  <section class="hud span-5">
    <div class="hud-label"><span class="tick"></span>Standing sources<span class="right">TAP A SOURCE FOR WHAT AND WHY</span></div>
    ${watches}
    <p style="font-size:11.5px;color:var(--text-faint);margin-top:12px;line-height:1.6;">These are the references ${r.name} stands on: consulted during research sessions, cited when a record depends on them. Citation counts are computed from the Commons itself.</p>
  </section>

  <section class="hud span-4">
    <div class="hud-label"><span class="tick"></span>Method distribution<span class="right">COMMONS</span></div>
    <div id="methods"><p class="term-empty" style="font-size:12px;">No records yet. This panel draws itself from the dataset.</p></div>
  </section>

  <section class="hud span-3">
    <div class="hud-label"><span class="tick"></span>Regional coverage<span class="right">FULL</span></div>
    <div class="region-grid" id="regions"><p class="term-empty" style="font-size:12px;">Awaiting the first mapped records.</p></div>
  </section>

  <section class="hud span-4">
    <div class="hud-label"><span class="tick"></span>Hardware &amp; software proposed<span class="right">BUILD LEADS</span></div>
    <div id="hardware-feed"><p class="term-empty" style="font-size:12px;">Not yet. A proposal ships only when a session's research earns one; an honest zero beats a fake spec.</p></div>
  </section>

  <section class="hud span-6">
    <div class="hud-label"><span class="tick"></span>Funding leads<span class="right">MONEY WORTH CHASING</span></div>
    <div id="funding-feed"><p class="term-empty" style="font-size:12px;">Not yet. Only real, currently open, cited leads publish here.</p></div>
  </section>

  <section class="hud span-6">
    <div class="hud-label"><span class="tick"></span>Accountability flags<span class="right">WORTH A CLOSER LOOK</span></div>
    <div id="flags-feed"><p class="term-empty" style="font-size:12px;">Not yet. A flag requires a specific, cited claim-versus-check mismatch, never absence of evidence alone.</p></div>
  </section>

  <section class="hud span-12">
    <div class="hud-label"><span class="tick"></span>Run log<span class="right">GENUINE EVENTS ONLY</span></div>
    <div class="term" id="runlog"><p class="term-empty">No research sessions logged under this mandate yet.</p></div>
  </section>

  <section class="hud span-12">
    <div class="hud-label"><span class="tick"></span>The ledger<span class="right">THE ACTUAL DATASET, NOT A PICTURE OF IT</span></div>
    <div class="ledger-purpose">
      <p><b>What this is</b>${r.name}'s working dataset: every organization it has verified in this domain, one row per record, with the source URLs that establish each one. Records enter only through the honesty gate; anything unsourced is quarantined, never published.</p>
      <p><b>What you can do with it</b>Filter it, download it as JSON, cite it, build on it. Each source link opens the page that establishes the record. The full dataset and pipeline live in the open repository; corrections land there, in the open record.</p>
    </div>
    <div class="ledger-actions">
      <a href="/data/${r.id}-organizations.json" download>DOWNLOAD JSON</a>
      <a href="/data/${r.id}-report.json" download>REPORT DATA</a>
      <a href="https://github.com/nathanielsolace/resolution-network" rel="noopener" target="_blank">OPEN REPOSITORY</a>
      <a href="/protocol.html#record-contract">THE RECORD CONTRACT</a>
    </div>
    <div class="ledger-tools">
      <input class="ledger-search" id="q" type="search" placeholder="filter by name, method, country, region&#8230;" aria-label="Filter the ledger">
      <span class="ledger-count" id="ledger-count"></span>
    </div>
    <div class="cc-table-scroll">
      <table class="cc-ledger">
        <thead><tr><th>Organization</th><th>Method</th><th>HQ</th><th>Regions</th><th>Founded</th><th>Sources</th></tr></thead>
        <tbody id="ledger-body"><tr><td colspan="6" class="term-empty" style="padding:20px;">The Commons for this mandate is empty until its first research session lands. An honest zero beats a fake thousand.</td></tr></tbody>
      </table>
    </div>
  </section>

    </div>
  </details>

  <section class="hud span-7" id="follow">
    <div class="hud-label"><span class="tick"></span>Subscribe to the ${r.name} Report<span class="right">ONE LIST, THIS MANDATE ONLY</span></div>
    <p style="color:var(--text-dim);font-size:14px;max-width:520px;">${r.name}'s research in your inbox when it publishes: report updates, dataset milestones, and connection wins from this mandate. No noise, ever.</p>
    <form class="follow-form" name="follow" method="POST" data-netlify="true" netlify-honeypot="website" action="/thanks.html" style="margin-top:16px;">
      <input type="hidden" name="form-name" value="follow">
      <input type="hidden" name="resolver" value="${r.id}">
      <p style="display:none;"><label>Leave this empty: <input name="website"></label></p>
      <input type="email" name="email" placeholder="you@example.com" required>
      <button type="submit" style="background:var(--accent);color:#06070b;">Follow ${r.name}</button>
    </form>
  </section>

  <div class="truth-foot">Every readout on this screen is generated from the public dataset and run log &#183; nothing is simulated &#183; <a href="/data/${r.id}-organizations.json" style="color:var(--text-dim);">inspect the raw data</a> &#183; <a href="/privacy.html" style="color:var(--text-dim);">privacy</a></div>
</main>

<script>
(function () {
  if (location.search.includes("stream")) document.body.classList.add("stream");

  // Real UTC clock. A clock is the one number a screen may generate itself.
  var clock = document.getElementById("clock");
  setInterval(function () {
    clock.textContent = new Date().toISOString().slice(11, 19) + " UTC";
  }, 1000);

  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };
  var fmtTs = function (iso) {
    return new Date(iso).toISOString().slice(5, 16).replace("T", " ");
  };
  var host = function (u) {
    try { return new URL(u).hostname.replace(/^www\\./, ""); } catch (e) { return u; }
  };

  // Standing sources: tap to open what/why.
  document.querySelectorAll("[data-src]").forEach(function (el) {
    el.querySelector(".src-row").addEventListener("click", function () {
      var open = el.hasAttribute("data-open");
      if (open) { el.removeAttribute("data-open"); this.setAttribute("aria-expanded", "false"); }
      else { el.setAttribute("data-open", ""); this.setAttribute("aria-expanded", "true"); }
    });
  });

  var ALL = [];
  function renderLedger(rows) {
    var body = document.getElementById("ledger-body");
    document.getElementById("ledger-count").textContent = rows.length + " / " + ALL.length + " RECORDS";
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="term-empty" style="padding:20px;">No records match.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function (o) {
      var srcs = (o.sources || []).slice(0, 3).map(function (s, i) {
        return '<a href="' + esc(s) + '" rel="noopener" title="' + esc(host(s)) + '">[' + (i + 1) + "]</a>";
      }).join(" ");
      return "<tr><td>" + esc(o.name) + '</td><td><span class="m-chip">' + esc(o.method) + "</span></td><td>" +
        esc(o.hq_country || "") + "</td><td>" + esc((o.regions || []).join(", ")) + "</td><td>" +
        (o.founded || "") + "</td><td>" + srcs + "</td></tr>";
    }).join("");
  }
  document.getElementById("q").addEventListener("input", function (e) {
    var q = e.target.value.toLowerCase();
    renderLedger(ALL.filter(function (o) {
      return JSON.stringify([o.name, o.method, o.hq_country, o.regions]).toLowerCase().includes(q);
    }));
  });

  function renderReport(rep) {
    if (rep.status_line) {
      document.getElementById("report-status").hidden = false;
      document.getElementById("report-status-t").textContent = rep.status_line;
    }
    if (rep.updated) document.getElementById("report-stamp").textContent = "Last update " + rep.updated;
    if (rep.findings && rep.findings.length) {
      document.getElementById("findings").innerHTML = rep.findings.map(function (f, i) {
        var srcs = (f.sources || []).map(function (s) {
          return '<a href="' + esc(s) + '" rel="noopener">' + esc(host(s)) + "</a>";
        }).join("");
        return '<div class="finding"><span class="fi">F' + String(i + 1).padStart(2, "0") + '</span><div><div class="ft">' + esc(f.text) + '</div><div class="fs">' + srcs + "</div></div></div>";
      }).join("");
    }
    if (rep.top_of_mind && rep.top_of_mind.length) {
      document.getElementById("mind").innerHTML = rep.top_of_mind.map(function (m) {
        return '<div class="mind"><p>' + esc(m) + "</p></div>";
      }).join("") + '<div class="mind-sig">&#8212; ' + ${JSON.stringify(r.name)} + ', in session</div>';
    }
    var u = (rep.updates || [])[0];
    if (u) {
      document.getElementById("update-wrap").hidden = false;
      document.getElementById("update-title").textContent = u.title;
      document.getElementById("update-date").textContent = u.date + " \\u00B7 UPDATE " + String(rep.updates_total).padStart(3, "0");
      document.getElementById("update-points").innerHTML = (u.summary_points || []).map(function (p) {
        return "<li>" + esc(p) + "</li>";
      }).join("");
      document.getElementById("update-body").innerHTML = (u.body || "").split(/\\n\\n+/).map(function (p) {
        return "<p>" + esc(p) + "</p>";
      }).join("");
      document.getElementById("update-srcs").innerHTML = (u.sources || []).map(function (s) {
        return '<a href="' + esc(s) + '" rel="noopener">' + esc(host(s)) + "</a>";
      }).join("");
      if (rep.updates.length > 1) {
        document.getElementById("update-log").innerHTML = "ARCHIVE " + rep.updates.slice(1).map(function (x) {
          return "<b>" + esc(x.date) + "</b> " + esc(x.title);
        }).join(" &#183; ");
      }
    }

    // Key findings row (above the fold): the most recent published update
    // titles and their first summary point, straight from the report archive.
    var kf = document.getElementById("kf-row");
    if (rep.updates && rep.updates.length) {
      kf.innerHTML = rep.updates.slice(0, 4).map(function (u) {
        var short = (u.date || "").slice(5).replace("-", "/");
        return '<div class="kf-card"><div class="kf-icon">' + esc(short) + '</div><h4>' + esc(u.title) +
          '</h4><p>' + esc((u.summary_points || [])[0] || "") + "</p></div>";
      }).join("");
    }

    // Chat panel: pre-set questions, real answers, no API call.
    var body = document.getElementById("chat-body");
    var prompts = document.getElementById("chat-prompts");
    var qa = rep.qa || [];
    if (qa.length) {
      body.innerHTML = "";
      var asked = {};
      var ask = function (item) {
        if (asked[item.id]) return;
        asked[item.id] = true;
        var srcs = (item.sources || []).map(function (s) {
          return '<a href="' + esc(s) + '" rel="noopener" target="_blank">' + esc(host(s)) + "</a>";
        }).join("");
        body.insertAdjacentHTML("beforeend",
          '<div class="chat-msg you">' + esc(item.q) + "</div>" +
          '<div class="chat-msg bot"><b>' + esc(${JSON.stringify(r.name)}) + '</b>' + esc(item.a) +
          (srcs ? '<div class="csrc">' + srcs + "</div>" : "") + "</div>");
        body.scrollTop = body.scrollHeight;
        renderChips();
      };
      var renderChips = function () {
        var remaining = qa.filter(function (item) { return !asked[item.id]; });
        prompts.innerHTML = remaining.map(function (item) {
          return '<button class="chat-chip" type="button" data-qa="' + esc(item.id) + '">' + esc(item.q) + "</button>";
        }).join("");
        Array.prototype.forEach.call(prompts.querySelectorAll("[data-qa]"), function (btn) {
          btn.addEventListener("click", function () {
            var item = qa.find(function (x) { return x.id === btn.getAttribute("data-qa"); });
            if (item) ask(item);
          });
        });
      };
      ask(qa[0]);
    }

    // Coverage by region: real distribution, computed from the Commons.
    var cov = document.getElementById("coverage");
    if (rep.coverage_by_region && rep.coverage_by_region.length) {
      cov.innerHTML = rep.coverage_by_region.map(function (c) {
        return '<div class="cov-row"><span class="cov-name">' + esc(c.name) + '</span><span class="cov-track"><span class="cov-bar" style="width:' + c.pct + '%"></span></span><span class="cov-pct">' + c.pct + "%</span></div>";
      }).join("");
    }

    // Hardware, funding, accountability: three more real, gated feeds.
    var setFeed = function (elId, items, render) {
      var el = document.getElementById(elId);
      if (items && items.length) el.innerHTML = items.map(render).join("");
    };
    setFeed("hardware-feed", rep.hardware_proposed, function (h) {
      var srcs = (h.sources || []).map(function (s) { return '<a href="' + esc(s) + '" rel="noopener">' + esc(host(s)) + "</a>"; }).join(" ");
      return '<div class="feed-item"><span class="fk">' + esc(h.proposed || "") + '</span><h5>' + esc(h.name) + "</h5><p>" + esc(h.description) +
        (h.cost_note ? " <b>" + esc(h.cost_note) + "</b>" : "") + '</p><div class="fn">' + srcs + "</div></div>";
    });
    setFeed("funding-feed", rep.funding_leads, function (f) {
      var srcs = (f.sources || []).map(function (s) { return '<a href="' + esc(s) + '" rel="noopener">' + esc(host(s)) + "</a>"; }).join(" ");
      return '<div class="feed-item"><span class="fk">' + esc(f.kind || "") + '</span><h5>' + esc(f.name) + "</h5><p>" + esc(f.relevance) +
        (f.amount_note ? " <b>" + esc(f.amount_note) + "</b>" : "") + '</p><div class="fn">' + srcs + "</div></div>";
    });
    setFeed("flags-feed", rep.accountability_flags, function (fl) {
      var srcs = (fl.sources || []).map(function (s) { return '<a href="' + esc(s) + '" rel="noopener">' + esc(host(s)) + "</a>"; }).join(" ");
      return '<div class="feed-item"><span class="fk">' + esc(fl.flagged || "") + '</span><h5>' + esc(fl.org) + "</h5><p>" + esc(fl.concern) + '</p><div class="fn">' + srcs + "</div></div>";
    });

    var setN = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    if (rep.connections && rep.connections.funnel) {
      var totalIntros = Object.values(rep.connections.funnel).reduce(function (a, b) { return a + b; }, 0);
      setN("s-intros", totalIntros);
    }
    setN("s-hardware", (rep.hardware_proposed || []).length);
    setN("s-funding", (rep.funding_leads || []).length);
    setN("s-flags", (rep.accountability_flags || []).length);
  }

  document.getElementById("update-toggle").addEventListener("click", function () {
    var open = document.getElementById("update-body").classList.toggle("open");
    this.textContent = open ? "COLLAPSE THE UPDATE" : "READ THE FULL UPDATE";
  });

  async function boot() {
    try {
      var rep = await (await fetch("/data/${r.id}-report.json", { cache: "no-store" })).json();
      renderReport(rep);
      if (rep.connections && rep.connections.funnel) {
        var f = rep.connections.funnel;
        ["proposed", "approved", "sent", "connected"].forEach(function (k) {
          var el = document.getElementById("cx-" + k);
          if (el) el.textContent = f[k] || 0;
        });
        var conf = rep.connections.confirmed || [];
        if (conf.length) {
          document.getElementById("cx-confirmed").innerHTML =
            '<div class="report-h" style="margin-top:14px;"><span class="tick"></span>Confirmed connections</div>' +
            conf.map(function (c) {
              return '<div class="finding"><span class="fi">&#10003;</span><div class="ft">' + esc(c.org_a) + " &#8596; " + esc(c.org_b) + "<div class=\\"fs\\" style=\\"color:var(--text-faint);font-size:12px;margin-top:4px;\\">" + esc(c.overlap) + "</div></div></div>";
            }).join("");
        }
      }
      (rep.watches || []).forEach(function (w, i) {
        var el = document.querySelector('[data-cite="' + i + '"]');
        if (!el) return;
        if (w.citations === null) { el.textContent = "PRIMARY LAYER"; }
        else if (w.citations > 0) { el.textContent = "CITED " + w.citations + "\\u00D7"; el.classList.add("cited"); }
        else { el.textContent = "REFERENCE"; }
      });
    } catch (e) { /* report absent until first render */ }

    try {
      var net = await (await fetch("/data/network.json", { cache: "no-store" })).json();
      var me = net.resolvers.find(function (x) { return x.id === "${r.id}"; });
      if (me) {
        var statusLabel = me.status === "active" ? "LIVE" : me.status === "commissioning" ? "COMMISSIONING" : "DOSSIER";
        document.getElementById("ops-status-v").textContent = statusLabel;
        document.getElementById("ops-status-v2").textContent = statusLabel;
        document.getElementById("tele-stamp").textContent = "GENERATED " + fmtTs(net.generated_at);
        ["s-orgs", "s-orgs2"].forEach(function (id) { document.getElementById(id).textContent = me.orgs_mapped.toLocaleString(); });
        ["s-countries", "s-countries2"].forEach(function (id) { document.getElementById(id).textContent = me.countries; });
        document.getElementById("s-sources").textContent = me.sources_cited.toLocaleString();
        ["s-briefs", "s-briefs2"].forEach(function (id) { document.getElementById(id).textContent = me.briefs_published; });
        var since = me.mandate_start || "0000";
        var mine = net.pulse.filter(function (ev) {
          return ev.resolver === "${r.id}" && ev.ts.slice(0, 10) >= since;
        }).slice(0, 12);
        if (mine.length) {
          document.getElementById("runlog").innerHTML = mine.map(function (ev) {
            return '<div class="term-line"><span class="term-ts">' + fmtTs(ev.ts) + '</span><span class="term-type">' +
              esc(ev.type.replace(/_/g, " ")) + '</span><span class="term-msg">' + esc(ev.detail) + "</span></div>";
          }).join("");
        }
      }
    } catch (e) { /* no fiction on failure */ }

    try {
      var led = await (await fetch("/data/${r.id}-organizations.json", { cache: "no-store" })).json();
      ALL = led.organizations || [];
      if (ALL.length) {
        renderLedger(ALL);
        var methods = {};
        var regions = {};
        ALL.forEach(function (o) {
          methods[o.method] = (methods[o.method] || 0) + 1;
          (o.regions || []).forEach(function (rg) { regions[rg] = (regions[rg] || 0) + 1; });
        });
        var mEntries = Object.entries(methods).sort(function (a, b) { return b[1] - a[1]; });
        var max = Math.max.apply(null, mEntries.map(function (m) { return m[1]; }));
        document.getElementById("methods").innerHTML = mEntries.map(function (m) {
          return '<div class="cc-method-row"><span class="cc-method-name" title="' + esc(m[0]) + '">' + esc(m[0]) + '</span><span class="cc-method-bar-track"><span class="cc-method-bar" style="width:' + (m[1] / max) * 100 + '%"></span></span><span class="cc-method-n">' + m[1] + "</span></div>";
        }).join("");
        var rEntries = Object.entries(regions).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 18);
        document.getElementById("regions").innerHTML = rEntries.map(function (rg) {
          return '<span class="region-chip">' + esc(rg[0]) + " <b>" + rg[1] + "</b></span>";
        }).join("");
      }
    } catch (e) { /* ledger absent until seeded */ }
  }

  boot();
  setInterval(boot, 90000);
})();
</script>
</body>
</html>
`;
}

for (const r of REGISTRY.resolvers) {
  if (r.status === "queued") continue; // queue identities live on the roster, not as empty shells
  fs.writeFileSync(path.join(outDir, `${r.id}.html`), page(r));
  console.log(`built command center: site/resolvers/${r.id}.html`);
}
