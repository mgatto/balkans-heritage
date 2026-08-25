#!/usr/bin/env node
// Browser "known-issues" query: given a platform feature this site ships, surface open and
// recently-fixed engine bugs from the Firefox and WebKit trackers so they can be triaged by
// hand before shipping. See docs/browser-bugs.md for the full rationale and the extension
// guide for COMPONENT_MAP.
//
// This is a correctness/QA tool, deliberately kept separate from scripts/browser-feature-intel.mjs
// (a learning/discovery aid). Different question ("what's broken in what I ship?" vs. "what
// should I learn next?"), different trigger (feature-adoption time vs. the study cycle).
//
// Two modes:
//
//   node scripts/browser-bugs.mjs --feature "<feature>"
//     Substring-matches the term against COMPONENT_MAP (feature id, name, aliases) and queries
//     the mapped Bugzilla component(s) on each vendor. The per-feature, on-adoption trigger.
//
//   node scripts/browser-bugs.mjs
//     Reads scripts/data/feature-inventory.json and runs the per-feature query for every entry
//     that has a COMPONENT_MAP mapping. An occasional inventory-wide sweep, still on-demand.
//
// Both print to stdout and exit 0 (warn-only, mirroring scripts/a11y.mjs and the --query mode
// of browser-feature-intel.mjs). Nothing is written to disk. Chromium is intentionally skipped
// (crbug.com has no stable public REST API, and Chrome is the lowest-regression-risk engine for
// CSS/HTML) — see docs/browser-bugs.md.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const INVENTORY_PATH = resolve(HERE, "data/feature-inventory.json");

// Firefox 102 (the oldest floor browser) shipped 2022-06-28. Bugzilla can't reliably answer
// "affects version >= X", so we proxy "relevant since the floor" with last_change_time on the
// recently-fixed query. It's a date proxy, not an exact version match — see docs/browser-bugs.md.
const FLOOR_DATE = "2022-06-28T00:00:00Z";

// Cap results per component per mode so a broad component can't dump hundreds of bugs.
const LIMIT = 20;

// The two engines we query. Both run Bugzilla, so the REST shape is identical; only the host and
// the human-facing show_bug URL differ. `bugs.webkit.org` is the public WebKit tracker (WebKit
// powers Safari); Apple's own Feedback Assistant is private and has no API, so this is the
// authoritative public source for Safari-affecting engine bugs.
const VENDORS = {
  firefox: {
    label: "Firefox",
    rest: "https://bugzilla.mozilla.org/rest/bug",
    show: "https://bugzilla.mozilla.org/show_bug.cgi?id=",
  },
  webkit: {
    label: "WebKit / Safari",
    rest: "https://bugs.webkit.org/rest/bug",
    show: "https://bugs.webkit.org/show_bug.cgi?id=",
  },
};

// Feature id -> where its bugs live. Keys match `id` in scripts/data/feature-inventory.json.
// `name`/`aliases` widen substring matching in --feature mode. `components` lists one
// {vendor, product, component} per engine to query.
//
// Firefox (product "Core") has granular components (Layout: Grid, Layout: Flexbox, …); WebKit's
// taxonomy is flatter (mostly "CSS", "Layout and Rendering", "Images"), so WebKit queries return
// broader, noisier result sets by nature. Verify component names against each tracker's live
// product page when adding entries; an unknown component degrades to an HTTP-error note, not a
// crash. See docs/browser-bugs.md.
const COMPONENT_MAP = {
  grid: {
    name: "CSS Grid",
    aliases: ["css grid", "grid layout", "grid-template"],
    components: [
      { vendor: "firefox", product: "Core", component: "Layout: Grid" },
      { vendor: "webkit", product: "WebKit", component: "CSS" },
    ],
  },
  "flexbox-gap": {
    name: "Flexbox gap",
    aliases: ["flexbox", "flex gap", "gap"],
    components: [
      { vendor: "firefox", product: "Core", component: "Layout: Flexbox" },
      { vendor: "webkit", product: "WebKit", component: "CSS" },
    ],
  },
  "shape-outside": {
    name: "shape-outside",
    aliases: ["shape outside", "css shapes", "shape-margin"],
    components: [
      { vendor: "firefox", product: "Core", component: "Layout: Floats" },
      { vendor: "webkit", product: "WebKit", component: "CSS" },
    ],
  },
  "clip-path": {
    name: "clip-path",
    aliases: ["clip path", "clipping", "basic shapes"],
    components: [
      { vendor: "firefox", product: "Core", component: "SVG" },
      { vendor: "webkit", product: "WebKit", component: "CSS" },
    ],
  },
  "aspect-ratio": {
    name: "aspect-ratio",
    aliases: ["aspect ratio"],
    components: [
      { vendor: "firefox", product: "Core", component: "Layout" },
      { vendor: "webkit", product: "WebKit", component: "Layout and Rendering" },
    ],
  },
  "object-fit": {
    name: "object-fit",
    aliases: ["object fit", "object-position"],
    components: [
      { vendor: "firefox", product: "Core", component: "Layout: Images, Video, and HTML Frames" },
      { vendor: "webkit", product: "WebKit", component: "Layout and Rendering" },
    ],
  },
  "min-max-clamp": {
    name: "min(), max(), and clamp()",
    aliases: ["clamp", "min max clamp", "css math functions"],
    components: [
      { vendor: "firefox", product: "Core", component: "CSS Parsing and Computed Values" },
      { vendor: "webkit", product: "WebKit", component: "CSS" },
    ],
  },
  "media-query-range-syntax": {
    name: "Media query range syntax",
    aliases: ["media query range", "media queries range", "range syntax"],
    components: [
      { vendor: "firefox", product: "Core", component: "CSS Parsing and Computed Values" },
      { vendor: "webkit", product: "WebKit", component: "CSS" },
    ],
  },
  "logical-properties": {
    name: "Logical properties",
    aliases: ["logical properties", "padding-inline", "margin-inline", "inset"],
    components: [
      { vendor: "firefox", product: "Core", component: "CSS Parsing and Computed Values" },
      { vendor: "webkit", product: "WebKit", component: "CSS" },
    ],
  },
  filter: {
    name: "CSS filter",
    aliases: ["filter", "filter effects", "drop-shadow", "sepia", "grayscale"],
    components: [
      { vendor: "firefox", product: "Core", component: "Graphics" },
      { vendor: "webkit", product: "WebKit", component: "CSS" },
    ],
  },
  "prefers-reduced-motion": {
    name: "prefers-reduced-motion media query",
    aliases: ["prefers-reduced-motion", "reduced motion"],
    components: [
      { vendor: "firefox", product: "Core", component: "CSS Parsing and Computed Values" },
      { vendor: "webkit", product: "WebKit", component: "CSS" },
    ],
  },
  "autonomous-custom-elements": {
    name: "Autonomous custom elements",
    aliases: ["custom elements", "web components", "shadow dom", "customelements"],
    components: [
      { vendor: "firefox", product: "Core", component: "DOM: Web Components" },
      { vendor: "webkit", product: "WebKit", component: "DOM" },
    ],
  },
  srcset: {
    name: "srcset and sizes",
    aliases: ["srcset", "sizes", "responsive images", "picture", "source"],
    components: [
      { vendor: "firefox", product: "Core", component: "Layout: Images, Video, and HTML Frames" },
      { vendor: "webkit", product: "WebKit", component: "Images" },
    ],
  },
  avif: {
    name: "AVIF",
    aliases: ["avif", "av1 image"],
    components: [
      { vendor: "firefox", product: "Core", component: "ImageLib" },
      { vendor: "webkit", product: "WebKit", component: "Images" },
    ],
  },
  webp: {
    name: "WebP",
    aliases: ["webp"],
    components: [
      { vendor: "firefox", product: "Core", component: "ImageLib" },
      { vendor: "webkit", product: "WebKit", component: "Images" },
    ],
  },
  "alt-text-generated-content": {
    name: "Alt text for generated content",
    aliases: ["alt text generated content", "content alt", "pseudo-element alt"],
    components: [
      { vendor: "firefox", product: "Core", component: "CSS Parsing and Computed Values" },
      { vendor: "webkit", product: "WebKit", component: "CSS" },
    ],
  },
};

// --- Matching (pure) -------------------------------------------------------------------

// Fold to lowercase and collapse every run of non-alphanumerics to a single space, so hyphenated
// ids, spaced names, and mixed punctuation all compare uniformly ("clip-path" ~ "clip path").
export function normalizeText(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Return the ids in `map` whose id/name/aliases substring-match the term (either direction, so a
// broader user term like "css grid" matches the id "grid", and a narrower "flex" matches
// "flexbox-gap"). Deliberately permissive: this is a warn-only tool and the human sees the hits.
export function matchFeature(term, map) {
  const needle = normalizeText(term);
  if (!needle) return [];
  const matches = [];
  for (const [id, entry] of Object.entries(map)) {
    const haystacks = [id, entry.name, ...(entry.aliases ?? [])].map(normalizeText);
    if (haystacks.some((h) => h && (h.includes(needle) || needle.includes(h)))) {
      matches.push(id);
    }
  }
  return matches;
}

// --- URL construction (pure) -----------------------------------------------------------

// Build a Bugzilla REST search URL. `mode` is "open" (unresolved) or "fixed" (RESOLVED FIXED,
// changed on/after floorDate). Kept pure and free of the VENDORS lookup so it's testable
// without a network.
export function buildQueryUrl(restBase, { product, component, mode, floorDate, limit = LIMIT }) {
  const url = new URL(restBase);
  const params = url.searchParams;
  params.set("product", product);
  params.set("component", component);
  params.set("include_fields", "id,summary,status,resolution,last_change_time");
  params.set("limit", String(limit));
  params.set("order", "changeddate DESC");
  if (mode === "fixed") {
    params.set("resolution", "FIXED");
    params.set("last_change_time", floorDate);
  } else {
    // Bugzilla represents "unresolved" as the resolution value "---".
    params.set("resolution", "---");
  }
  return url.href;
}

// --- Response parsing + formatting (pure) ----------------------------------------------

// Normalize a Bugzilla REST /bug response to the minimal per-bug fields we display. Tolerates a
// missing/!array `bugs` and missing per-bug fields (returns empty strings / null).
export function parseBugzillaResponse(json) {
  const bugs = Array.isArray(json?.bugs) ? json.bugs : [];
  return bugs.map((bug) => ({
    id: bug?.id ?? null,
    summary: String(bug?.summary ?? "").trim(),
    status: bug?.status ?? "",
    resolution: bug?.resolution ?? "",
    lastChanged: bug?.last_change_time ?? null,
  }));
}

// One bug as a two-line block: a headline (id, summary, status/resolution, date) and the
// show_bug URL on its own line so terminals linkify it.
export function formatBugEntry(bug, showBase) {
  const status = [bug.status, bug.resolution].filter(Boolean).join(" ");
  const date = bug.lastChanged ? String(bug.lastChanged).slice(0, 10) : "";
  const meta = [status, date].filter(Boolean).join(", ");
  const suffix = meta ? ` (${meta})` : "";
  return `- [Bug ${bug.id}] ${bug.summary}${suffix}\n  ${showBase}${bug.id}`;
}

// A single "Open" / "Recently fixed" result group: an error note, a "none" note, or a counted
// list of formatted bugs.
function formatResultGroup(label, group, showBase) {
  if (group.error) return [`${label}: unavailable (${group.error})`];
  if (group.bugs.length === 0) return [`${label}: none`];
  const lines = [`${label} (${group.bugs.length}):`];
  for (const bug of group.bugs) lines.push(formatBugEntry(bug, showBase));
  return lines;
}

// The full per-feature block: a heading, then an open + recently-fixed group per vendor/component.
export function formatFeatureSection(feature, floorDate = FLOOR_DATE) {
  const lines = [`## ${feature.name} (${feature.id})`, ""];
  for (const vendor of feature.vendors) {
    lines.push(`### ${vendor.label} — ${vendor.product} / ${vendor.component}`);
    lines.push(...formatResultGroup("Open", vendor.open, vendor.showBase));
    lines.push(...formatResultGroup(`Recently fixed (changed since ${String(floorDate).slice(0, 10)})`, vendor.fixed, vendor.showBase));
    lines.push("");
  }
  return lines.join("\n").replace(/\s*$/, "");
}

// --- Fetching + orchestration (I/O) ----------------------------------------------------

// One Bugzilla search. Degrades to { bugs: [], error } on any non-ok status or thrown error, so
// a flaky tracker never crashes the run (warn-only).
async function fetchBugs(url) {
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) return { bugs: [], error: `HTTP ${response.status}` };
    const json = await response.json();
    return { bugs: parseBugzillaResponse(json), error: null };
  } catch (err) {
    return { bugs: [], error: err?.message ?? String(err) };
  }
}

// Query every mapped component for one feature id, returning the structured shape
// formatFeatureSection expects. Open + recently-fixed are fetched in parallel per component.
async function queryFeature(id) {
  const entry = COMPONENT_MAP[id];
  const feature = { id, name: entry.name, vendors: [] };
  for (const target of entry.components) {
    const vendor = VENDORS[target.vendor];
    const common = { product: target.product, component: target.component, floorDate: FLOOR_DATE };
    const [open, fixed] = await Promise.all([
      fetchBugs(buildQueryUrl(vendor.rest, { ...common, mode: "open" })),
      fetchBugs(buildQueryUrl(vendor.rest, { ...common, mode: "fixed" })),
    ]);
    feature.vendors.push({
      label: vendor.label,
      product: target.product,
      component: target.component,
      showBase: vendor.show,
      open,
      fixed,
    });
  }
  return feature;
}

function loadInventory() {
  try {
    return JSON.parse(readFileSync(INVENTORY_PATH, "utf-8"));
  } catch {
    return { features: [] };
  }
}

function printPreamble() {
  console.log("Known-issues query (warn-only). Firefox + WebKit/Safari Bugzilla; Chromium skipped.");
  console.log(`Caps: up to ${LIMIT} open + ${LIMIT} recently-fixed bugs per component.`);
  console.log(`Recently-fixed = RESOLVED FIXED, last changed since ${FLOOR_DATE.slice(0, 10)} (Firefox 102 release, a date proxy for the floor).`);
}

async function runFeatureQuery(term) {
  const ids = matchFeature(term, COMPONENT_MAP);
  if (ids.length === 0) {
    console.log(`\nNo component mapping for "${term}".`);
    console.log("Add an entry to COMPONENT_MAP in scripts/browser-bugs.mjs — see docs/browser-bugs.md.");
    return;
  }
  printPreamble();
  console.log(`\nMatched: ${ids.join(", ")}`);
  for (const id of ids) {
    const feature = await queryFeature(id);
    console.log(`\n${formatFeatureSection(feature)}`);
  }
}

async function runInventorySweep() {
  const inventory = loadInventory();
  const features = inventory.features ?? [];
  if (features.length === 0) {
    console.log("No features found in scripts/data/feature-inventory.json.");
    return;
  }
  printPreamble();
  console.log(`\nSweeping ${features.length} inventory feature(s).`);
  for (const item of features) {
    if (!COMPONENT_MAP[item.id]) {
      console.log(`\n## ${item.name} (${item.id})\n\n_Not in COMPONENT_MAP — add it in scripts/browser-bugs.mjs to include it in the sweep._`);
      continue;
    }
    const feature = await queryFeature(item.id);
    console.log(`\n${formatFeatureSection(feature)}`);
  }
}

async function main(argv = process.argv.slice(2)) {
  const featureIndex = argv.indexOf("--feature");
  if (featureIndex !== -1) {
    const term = argv.slice(featureIndex + 1).join(" ").trim();
    if (!term) {
      console.error('Usage: node scripts/browser-bugs.mjs --feature "<feature>"');
      process.exitCode = 1;
      return;
    }
    await runFeatureQuery(term);
    return;
  }
  await runInventorySweep();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err?.message ?? err);
    process.exitCode = 1;
  });
}
