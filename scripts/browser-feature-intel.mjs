#!/usr/bin/env node
// Browser feature "intel": surfaces newly-landed HTML/CSS/Web-API features so they
// can be triaged into the CSS and Web Components mastery checklists. See
// docs/browser-feature-intel.md for the full rationale, sources, and triage ritual.
//
// Two modes:
//
//   node scripts/browser-feature-intel.mjs
//     Scheduled diff-and-log run. Diffs the current Baseline dataset (web-features)
//     against the last committed snapshot (scripts/data/browser-feature-intel-state.json)
//     to find features that just crossed into Baseline "newly"/"widely" available,
//     scoped to groups relevant to this project (CSS, HTML, DOM/Web Components, SVG,
//     forms, images, …). Each hit is enriched with caniuse-lite's per-browser support
//     versions, and recent browser-vendor release notes (Firefox via MDN, Chrome via
//     Chromium Dash) and blog posts are listed as reading candidates. The result is
//     appended to docs/browser-feature-intel-log.md and the snapshot is rewritten.
//     Warn-only: prints and exits 0 (mirrors scripts/a11y.mjs).
//
//   node scripts/browser-feature-intel.mjs --query "<term>"
//     Read-only ad-hoc lookup for a specific feature read about elsewhere. Substring
//     matches web-features ids/names, enriched the same way, printed to stdout. Falls
//     back to a raw @mdn/browser-compat-data lookup (unglossed — no Baseline status)
//     when web-features has no match. Never writes the log or snapshot.
//
// web-features is the primary "what's new" signal because it ships a precomputed
// baseline_low_date/baseline_high_date; caniuse-lite (already resident via browserslist)
// only enriches, and BCD is a query-only fallback — neither can substitute for Baseline's
// cross-engine "as of when is this safe" judgment. See the doc for why.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Parser } from "htmlparser2";
import { features as webFeatures, groups as webGroups } from "web-features";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

const STATE_PATH = resolve(HERE, "data/browser-feature-intel-state.json");
const LOG_PATH = resolve(REPO_ROOT, "docs/browser-feature-intel-log.md");

// Checklists whose items we already track — a flagged feature already named in one of
// these is noise, so it's filtered out of the report (still snapshotted for the diff).
const CHECKLIST_PATHS = [
  resolve(REPO_ROOT, "docs/future/css-mastery-checklist.md"),
  resolve(REPO_ROOT, "docs/future/html-webcomponents-mastery-checklist.md"),
];

// Browser-vendor "what shipped" sources. Surfaced as reading candidates (headline + link),
// not parsed into structured features — a human skims them. Fetch failures degrade to a
// note rather than crashing the run. Three source types, dispatched by `type` in
// fetchSection():
//   - "feed"            RSS/Atom, deduped by post date (developer blogs).
//   - "release-index"   an HTML index of per-version release-note links, deduped by the
//                       highest version seen (e.g. MDN's Firefox developer notes).
//   - "chrome-milestone" the Chromium Dash JSON API, resolved to the current stable
//                       milestone's release-notes page (Chrome's index is client-rendered,
//                       so it can't be scraped like MDN's).
const BLOG_SOURCES = [
  { name: "Chrome blog (developer.chrome.com)", type: "feed", url: "https://developer.chrome.com/blog/feed.xml" },
  { name: "WebKit / Safari (webkit.org)", type: "feed", url: "https://webkit.org/feed/" },
  { name: "Mozilla Hacks", type: "feed", url: "https://hacks.mozilla.org/feed/" },
  {
    name: "Firefox release notes (MDN, for developers)",
    type: "release-index",
    url: "https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases",
    origin: "https://developer.mozilla.org",
    itemLabel: "Firefox",
    // Per-version developer notes, e.g. /en-US/docs/Mozilla/Firefox/Releases/154
    linkPattern: /^\/en-US\/docs\/Mozilla\/Firefox\/Releases\/(\d+(?:\.\d+)?)$/,
  },
  {
    name: "Chrome release notes (Blink)",
    type: "chrome-milestone",
    // Chromium Dash reports the current Stable milestone; we link to its release notes.
    url: "https://chromiumdash.appspot.com/fetch_releases?channel=Stable&num=1&platform=Windows",
    notesBase: "https://developer.chrome.com/release-notes",
    itemLabel: "Chrome",
  },
];

// Curated set of web-features group *roots* (via each group's parent chain) that fit this
// project: a standards-first, dependency-light HTML/CSS/Web-Components content site. A
// feature counts as in-scope when any of its groups resolves to one of these. Deliberately
// excludes JS-language, hardware, networking, and infra groups (arrays, webgpu, fetch, …)
// that don't belong on the CSS/HTML/WC checklists. Extend as the site's scope grows.
const RELEVANT_GROUP_ROOTS = new Set([
  "css",
  "html",
  "svg",
  "dom",
  "web-components",
  "images",
  "clipping-shapes-masking",
  "view-transitions",
  "scrolling",
  "text-fragments",
  "selection",
  "animation",
  "reading-order",
]);

// caniuse-lite browser keys -> display labels, limited to the engines this project targets
// (see the browserslist floor in package.json). Order is the display order.
const CANIUSE_BROWSERS = [
  ["chrome", "Chrome"],
  ["firefox", "Firefox"],
  ["safari", "Safari"],
  ["edge", "Edge"],
  ["ios_saf", "iOS Safari"],
];

// BCD browser keys -> display labels for the query fallback.
const BCD_BROWSERS = [
  ["chrome", "Chrome"],
  ["firefox", "Firefox"],
  ["safari", "Safari"],
  ["edge", "Edge"],
  ["safari_ios", "iOS Safari"],
];

const MAX_BLOG_ENTRIES = 10; // cap per feed so a stale lastSeen can't dump a huge backlog
const FIRST_RUN_BLOG_ENTRIES = 5; // when there's no lastSeen yet, show only the most recent
const MAX_RELEASE_ENTRIES = 3; // release-note versions are heavier than posts; keep it tight

// --- Baseline snapshot + diff (pure) --------------------------------------------------

const BASELINE_RANK = { false: 0, low: 1, high: 2 };

function baselineRank(baseline) {
  return BASELINE_RANK[String(baseline)] ?? 0;
}

// Reduce the full web-features dataset to the minimal per-feature Baseline facts we persist
// and diff against. Only real features (kind === "feature") — "moved"/"split" are redirects.
export function snapshotFeatures(features) {
  const snapshot = {};
  for (const [id, feature] of Object.entries(features)) {
    if (feature.kind !== "feature") continue;
    const status = feature.status ?? {};
    snapshot[id] = {
      baseline: status.baseline ?? false,
      low: status.baseline_low_date ?? null,
      high: status.baseline_high_date ?? null,
    };
  }
  return snapshot;
}

// Features whose Baseline status advanced (false -> low -> high) since the previous
// snapshot, including ids absent from it (treated as rank -1) so a brand-new "newly
// available" feature registers. Only advances to low/high are returned. The caller decides
// what to do on a truly empty previous snapshot (first run) — see main().
export function diffBaseline(previous, current) {
  const advanced = [];
  for (const [id, now] of Object.entries(current)) {
    const before = previous[id];
    const prevRank = before ? baselineRank(before.baseline) : -1;
    const nowRank = baselineRank(now.baseline);
    if (nowRank >= 1 && nowRank > prevRank) {
      advanced.push({
        id,
        fromBaseline: before ? before.baseline : null,
        toBaseline: now.baseline,
        isNew: !before,
      });
    }
  }
  return advanced.sort((a, b) => a.id.localeCompare(b.id));
}

// --- Relevance filtering (pure) --------------------------------------------------------

export function rootGroupOf(groupId, groups) {
  let current = groupId;
  const seen = new Set();
  while (groups[current]?.parent && !seen.has(current)) {
    seen.add(current);
    current = groups[current].parent;
  }
  return current;
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

// In scope when any of the feature's groups resolves to a root in RELEVANT_GROUP_ROOTS.
// Features with no group are treated as out of scope (nothing to place them under).
export function isRelevantFeature(feature, groups, relevantRoots = RELEVANT_GROUP_ROOTS) {
  return asArray(feature.group).some((groupId) => relevantRoots.has(rootGroupOf(groupId, groups)));
}

// Drop flagged features already named (by id or name, case-insensitively) in the checklist
// text, so the report only surfaces genuinely new candidates.
export function filterAlreadyTracked(flagged, checklistText, features) {
  const haystack = checklistText.toLowerCase();
  return flagged.filter(({ id }) => {
    const name = features[id]?.name ?? "";
    if (haystack.includes(id.toLowerCase())) return false;
    if (name && haystack.includes(name.toLowerCase())) return false;
    return true;
  });
}

// --- caniuse-lite enrichment (pure core) ----------------------------------------------

// Given a caniuse-lite stats object ({ browser: { version: supportFlag } }), return the
// earliest fully-supported ("y") version per targeted browser, as a display map. Partial
// ("a") support with no full support is reported as "partial". Absent -> omitted.
export function earliestSupported(stats, browsers = CANIUSE_BROWSERS) {
  const result = {};
  for (const [key, label] of browsers) {
    const table = stats?.[key];
    if (!table) continue;
    let fullMin = null;
    let hasPartial = false;
    for (const [version, flag] of Object.entries(table)) {
      const tokens = String(flag).split(" ");
      const num = parseFloat(version);
      if (tokens.includes("y")) {
        if (fullMin === null || (Number.isFinite(num) && num < fullMin.num)) {
          fullMin = { version, num: Number.isFinite(num) ? num : Infinity };
        }
      } else if (tokens.includes("a")) {
        hasPartial = true;
      }
    }
    if (fullMin) result[label] = fullMin.version;
    else if (hasPartial) result[label] = "partial";
  }
  return result;
}

// Look up per-browser support for a web-features `caniuse` id list via caniuse-lite.
// Returns { id, link, since } for the first id present in the dataset, or null.
function caniuseEnrichment(caniuseField) {
  let lite;
  try {
    lite = require("caniuse-lite");
  } catch {
    return null;
  }
  for (const id of asArray(caniuseField)) {
    const packed = lite.features?.[id];
    if (!packed) continue;
    const unpacked = lite.feature(packed);
    return {
      id,
      link: `https://caniuse.com/${id}`,
      since: earliestSupported(unpacked.stats),
    };
  }
  return null;
}

// --- Formatting (pure) -----------------------------------------------------------------

function firstSpec(spec) {
  const specs = asArray(spec);
  return specs.length > 0 ? specs[0] : null;
}

function baselineLabel(baseline, status = {}) {
  if (baseline === "high") {
    return `Baseline widely available${status.baseline_high_date ? ` (since ${status.baseline_high_date})` : ""}`;
  }
  if (baseline === "low") {
    return `Baseline newly available${status.baseline_low_date ? ` (since ${status.baseline_low_date})` : ""}`;
  }
  return "Baseline: limited";
}

function formatSince(since) {
  const parts = Object.entries(since).map(([label, version]) =>
    version === "partial" ? `${label} (partial)` : `${label} ${version}`,
  );
  return parts.length > 0 ? parts.join(", ") : "no caniuse support data";
}

// One Markdown block per flagged feature: name/status, per-browser support, links, and an
// empty triage checkbox for the human to promote it (or not) into a checklist.
export function formatFeatureEntry(entry, features, caniuse) {
  const feature = features[entry.id] ?? {};
  const lines = [];
  const transition = entry.isNew ? "newly tracked" : `was ${entry.fromBaseline || "limited"}`;
  lines.push(`### ${feature.name ?? entry.id} (\`${entry.id}\`)`);
  lines.push("");
  lines.push(`- Status: ${baselineLabel(entry.toBaseline, feature.status)} — ${transition}`);
  if (feature.description) lines.push(`- ${feature.description}`);
  if (caniuse) {
    lines.push(`- Support: ${formatSince(caniuse.since)}`);
    lines.push(`- caniuse: ${caniuse.link}`);
  }
  const spec = firstSpec(feature.spec);
  if (spec) lines.push(`- Spec: ${spec}`);
  lines.push("- [ ] Triaged (promote to a mastery checklist, or note why not)");
  return lines.join("\n");
}

function formatBlogEntry(item) {
  const date = item.date ? `${item.date.slice(0, 10)} — ` : "";
  return `- ${date}[${item.title}](${item.link})`;
}

// Assemble the full dated log section appended on each scheduled run.
export function formatLogSection(dateIso, featureBlocks, blogSections) {
  const lines = [`## ${dateIso.slice(0, 10)}`, ""];

  lines.push("### Newly-landed features in scope", "");
  if (featureBlocks.length === 0) {
    lines.push("_No newly-crossed Baseline features in scope since the last run._", "");
  } else {
    for (const block of featureBlocks) lines.push(block, "");
  }

  lines.push("### Browser-vendor release notes & blog posts", "");
  for (const section of blogSections) {
    lines.push(`#### ${section.name}`, "");
    if (section.error) {
      lines.push(`_Source unavailable: ${section.error}_`, "");
    } else if (section.items.length === 0) {
      lines.push("_Nothing new since the last run._", "");
    } else {
      for (const item of section.items) lines.push(formatBlogEntry(item));
      lines.push("");
    }
  }

  return lines.join("\n");
}

// --- Feed parsing (pure) + fetching (I/O) ---------------------------------------------

// Extract {title, link, date} records from an RSS <item> or Atom <entry> feed using
// htmlparser2 in XML mode (CDATA-aware), rather than a fragile regex.
export function parseFeed(xml) {
  const items = [];
  let current = null;
  let text = "";

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const tag = name.toLowerCase();
        if (tag === "item" || tag === "entry") {
          current = { title: "", link: "", date: null };
        }
        // Atom links carry the URL in an href attribute; prefer the primary rel.
        if (current && tag === "link" && attribs.href) {
          if (!current.link || attribs.rel === "alternate" || !attribs.rel) {
            current.link = attribs.href;
          }
        }
        text = "";
      },
      ontext(chunk) {
        text += chunk;
      },
      onclosetag(name) {
        const tag = name.toLowerCase();
        const value = text.trim();
        if (current) {
          if (tag === "title" && value) current.title = value;
          else if (tag === "link" && value) current.link = value; // RSS link is text content
          else if ((tag === "pubdate" || tag === "updated" || tag === "published") && value) {
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime())) current.date = parsed.toISOString();
          } else if (tag === "item" || tag === "entry") {
            if (current.title || current.link) items.push(current);
            current = null;
          }
        }
        text = "";
      },
    },
    { xmlMode: true, recognizeCDATA: true, decodeEntities: true },
  );
  parser.write(xml);
  parser.end();
  return items;
}

// Pick the blog entries worth showing: those newer than lastSeen (by date), capped; or the
// most recent handful on a first run when there's no lastSeen yet.
export function selectNewBlogEntries(items, lastSeenIso) {
  const sorted = [...items].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  if (!lastSeenIso) return sorted.slice(0, FIRST_RUN_BLOG_ENTRIES);
  return sorted.filter((item) => item.date && item.date > lastSeenIso).slice(0, MAX_BLOG_ENTRIES);
}

// --- Release-index parsing (pure) ------------------------------------------------------

// Numeric, segment-wise version compare ("154" > "153.1.0" > "3.6"). Returns >0 if a > b.
export function compareVersions(a, b) {
  const pa = String(a).split(".");
  const pb = String(b).split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = Number(pa[i] ?? 0) || 0;
    const y = Number(pb[i] ?? 0) || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

// Extract {version, href, title} records from an HTML release-notes index: every <a> whose
// href matches linkPattern (capturing a version in group 1). Deduped by version, keeping the
// first occurrence (main content precedes any sidebar/archive duplicates on MDN).
export function parseReleaseIndex(html, linkPattern) {
  const releases = [];
  const seen = new Set();
  let capture = null;
  let text = "";

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (name.toLowerCase() === "a" && attribs.href) {
          const match = attribs.href.match(linkPattern);
          if (match) {
            capture = { version: match[1], href: attribs.href };
            text = "";
          }
        }
      },
      ontext(chunk) {
        if (capture) text += chunk;
      },
      onclosetag(name) {
        if (name.toLowerCase() === "a" && capture) {
          if (!seen.has(capture.version)) {
            seen.add(capture.version);
            releases.push({ version: capture.version, href: capture.href, title: text.replace(/\s+/g, " ").trim() });
          }
          capture = null;
          text = "";
        }
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  return releases;
}

// Pick the release versions worth showing: those higher than lastSeenVersion, newest first,
// capped; or the newest few on a first run. Pure — returns the release records unchanged.
export function selectNewReleases(releases, lastSeenVersion, max = MAX_RELEASE_ENTRIES) {
  const sorted = [...releases].sort((a, b) => compareVersions(b.version, a.version));
  const chosen = lastSeenVersion
    ? sorted.filter((release) => compareVersions(release.version, lastSeenVersion) > 0)
    : sorted;
  return chosen.slice(0, max);
}

// Each fetcher returns a uniform section: { name, url, items:[{title,link,date}], error?,
// cursor }. `cursor` is the opaque per-source value persisted in state to dedup next run —
// an ISO date for feeds, a version string for release indexes, a milestone for Chrome.

async function fetchFeedSection(source, cursor) {
  try {
    const response = await fetch(source.url, { headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" } });
    if (!response.ok) return { name: source.name, url: source.url, error: `HTTP ${response.status}`, items: [], cursor };
    const xml = await response.text();
    const parsed = parseFeed(xml);
    const items = selectNewBlogEntries(parsed, cursor);
    const newestDate = parsed.reduce((max, item) => (item.date && item.date > (max ?? "") ? item.date : max), cursor ?? null);
    return { name: source.name, url: source.url, items, cursor: newestDate };
  } catch (err) {
    return { name: source.name, url: source.url, error: err?.message ?? String(err), items: [], cursor };
  }
}

async function fetchReleaseIndexSection(source, cursor) {
  try {
    const response = await fetch(source.url, { redirect: "follow" });
    if (!response.ok) return { name: source.name, url: source.url, error: `HTTP ${response.status}`, items: [], cursor };
    const html = await response.text();
    const releases = parseReleaseIndex(html, source.linkPattern);
    if (releases.length === 0) return { name: source.name, url: source.url, error: "no version links found", items: [], cursor };
    const items = selectNewReleases(releases, cursor).map((release) => ({
      title: /\d/.test(release.title) ? release.title : `${source.itemLabel ?? "Release"} ${release.version}`,
      link: new URL(release.href, source.origin).href,
      date: null,
    }));
    const newestVersion = releases.reduce((max, release) => (compareVersions(release.version, max) > 0 ? release.version : max), cursor ?? "0");
    return { name: source.name, url: source.url, items, cursor: newestVersion };
  } catch (err) {
    return { name: source.name, url: source.url, error: err?.message ?? String(err), items: [], cursor };
  }
}

async function fetchChromeMilestoneSection(source, cursor) {
  try {
    const response = await fetch(source.url);
    if (!response.ok) return { name: source.name, url: source.url, error: `HTTP ${response.status}`, items: [], cursor };
    const data = await response.json();
    const latest = Array.isArray(data) ? data[0] : null;
    const milestone = latest?.milestone;
    if (!milestone) return { name: source.name, url: source.url, error: "no stable milestone reported", items: [], cursor };
    const current = String(milestone);
    const isNew = !cursor || compareVersions(current, cursor) > 0;
    const items = isNew
      ? [{
          title: `${source.itemLabel ?? "Chrome"} ${milestone} release notes`,
          link: `${source.notesBase}/${milestone}`,
          date: latest.time ? new Date(latest.time).toISOString() : null,
        }]
      : [];
    return { name: source.name, url: source.url, items, cursor: current };
  } catch (err) {
    return { name: source.name, url: source.url, error: err?.message ?? String(err), items: [], cursor };
  }
}

function fetchSection(source, cursor) {
  switch (source.type) {
    case "release-index":
      return fetchReleaseIndexSection(source, cursor);
    case "chrome-milestone":
      return fetchChromeMilestoneSection(source, cursor);
    case "feed":
    default:
      return fetchFeedSection(source, cursor);
  }
}

// --- State I/O ------------------------------------------------------------------------

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
  } catch {
    return { baseline: {}, blogs: {} };
  }
}

function writeState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

// --- Query mode (pure matchers) --------------------------------------------------------

export function queryWebFeatures(term, features) {
  const needle = term.toLowerCase();
  const matches = [];
  for (const [id, feature] of Object.entries(features)) {
    if (feature.kind !== "feature") continue;
    const name = feature.name ?? "";
    if (id.toLowerCase().includes(needle) || name.toLowerCase().includes(needle)) {
      matches.push({ id, feature });
    }
  }
  return matches.sort((a, b) => a.id.localeCompare(b.id));
}

// Flatten a BCD subtree into { path, compat } records (every node carrying __compat).
export function flattenBcd(node, prefix = "", out = []) {
  if (!node || typeof node !== "object") return out;
  for (const [key, value] of Object.entries(node)) {
    if (key === "__meta" || key === "browsers") continue;
    if (!value || typeof value !== "object") continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (key === "__compat") {
      out.push({ path: prefix, compat: value });
      continue;
    }
    flattenBcd(value, path, out);
  }
  return out;
}

export function queryBcd(term, bcd) {
  const needle = term.toLowerCase();
  return flattenBcd(bcd)
    .filter(({ path }) => path.toLowerCase().includes(needle))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function bcdSupportSummary(compat) {
  const support = compat?.support ?? {};
  const parts = [];
  for (const [key, label] of BCD_BROWSERS) {
    const statement = Array.isArray(support[key]) ? support[key][0] : support[key];
    const added = statement?.version_added;
    if (added === undefined || added === null) continue;
    if (added === false) parts.push(`${label} —`);
    else if (added === true) parts.push(`${label} yes`);
    else parts.push(`${label} ${added}`);
  }
  return parts.length > 0 ? parts.join(", ") : "no support data";
}

function runQuery(term) {
  const wf = queryWebFeatures(term, webFeatures);
  if (wf.length > 0) {
    console.log(`\nweb-features matches for "${term}" (${wf.length}):`);
    for (const { id, feature } of wf) {
      const status = feature.status ?? {};
      const caniuse = caniuseEnrichment(feature.caniuse);
      console.log(`\n${feature.name ?? id} (${id})`);
      console.log(`  ${baselineLabel(status.baseline, status)}`);
      if (feature.description) console.log(`  ${feature.description}`);
      if (caniuse) {
        console.log(`  Support: ${formatSince(caniuse.since)}`);
        console.log(`  caniuse: ${caniuse.link}`);
      }
      const spec = firstSpec(feature.spec);
      if (spec) console.log(`  Spec: ${spec}`);
    }
    return;
  }

  // Fallback: web-features had nothing curated — try raw BCD (unglossed, no Baseline).
  let bcd;
  try {
    bcd = require("@mdn/browser-compat-data");
  } catch {
    console.log(`\nNo web-features match for "${term}", and @mdn/browser-compat-data is unavailable.`);
    return;
  }
  const hits = queryBcd(term, bcd).slice(0, 15);
  if (hits.length === 0) {
    console.log(`\nNo match for "${term}" in web-features or @mdn/browser-compat-data.`);
    return;
  }
  console.log(`\nNo curated web-features entry for "${term}".`);
  console.log(`Falling back to raw @mdn/browser-compat-data (unglossed — no Baseline status; showing up to 15):`);
  for (const { path, compat } of hits) {
    console.log(`\n${path}`);
    console.log(`  ${bcdSupportSummary(compat)}`);
    if (compat.mdn_url) console.log(`  MDN: ${compat.mdn_url}`);
  }
}

// --- Scheduled diff-and-log mode -------------------------------------------------------

async function runScheduled() {
  const state = loadState();
  const previousBaseline = state.baseline ?? {};
  const currentBaseline = snapshotFeatures(webFeatures);
  const firstRun = Object.keys(previousBaseline).length === 0;

  let featureBlocks = [];
  if (firstRun) {
    console.log("No previous snapshot found — seeding baseline state without reporting (avoids a full-dataset dump).");
  } else {
    const advanced = diffBaseline(previousBaseline, currentBaseline);
    const relevant = advanced.filter((entry) => {
      const feature = webFeatures[entry.id];
      return feature && isRelevantFeature(feature, webGroups);
    });
    const checklistText = CHECKLIST_PATHS.map((path) => {
      try {
        return readFileSync(path, "utf-8");
      } catch {
        return "";
      }
    }).join("\n");
    const candidates = filterAlreadyTracked(relevant, checklistText, webFeatures);
    featureBlocks = candidates.map((entry) => formatFeatureEntry(entry, webFeatures, caniuseEnrichment(webFeatures[entry.id]?.caniuse)));
    console.log(`${advanced.length} feature(s) advanced in Baseline; ${relevant.length} in scope; ${candidates.length} not already tracked.`);
  }

  const blogState = { ...(state.blogs ?? {}) };
  const blogSections = [];
  for (const source of BLOG_SOURCES) {
    const section = await fetchSection(source, blogState[source.url]);
    blogSections.push(section);
    if (section.cursor) blogState[source.url] = section.cursor;
    if (section.error) console.log(`Source "${source.name}" unavailable: ${section.error}`);
  }

  const nowIso = new Date().toISOString();
  const section = formatLogSection(nowIso, featureBlocks, blogSections);
  appendLogSection(section);

  writeState({
    generatedAt: nowIso,
    webFeaturesVersion: readWebFeaturesVersion(),
    baseline: currentBaseline,
    blogs: blogState,
  });

  console.log(`\nAppended a dated section to ${LOG_PATH.replace(`${REPO_ROOT}/`, "")} and updated the snapshot.`);
}

function readWebFeaturesVersion() {
  // web-features' `exports` map doesn't expose ./package.json, so resolve the package's
  // entry point and read the sibling package.json directly rather than via require().
  try {
    const pkgPath = resolve(dirname(require.resolve("web-features")), "package.json");
    return JSON.parse(readFileSync(pkgPath, "utf-8")).version;
  } catch {
    return null;
  }
}

// Insert the new section directly under the log's H1 header (newest-first), so the file
// reads top-down chronologically without rewriting old entries.
function appendLogSection(section) {
  let existing;
  try {
    existing = readFileSync(LOG_PATH, "utf-8");
  } catch {
    existing = "";
  }

  if (!existing.trim()) {
    writeFileSync(LOG_PATH, `${section}\n`);
    return;
  }

  const lines = existing.split("\n");
  let insertAt = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      insertAt = i;
      break;
    }
  }
  const before = lines.slice(0, insertAt).join("\n").replace(/\s*$/, "");
  const after = lines.slice(insertAt).join("\n").replace(/^\s*/, "");
  const rebuilt = `${before}\n\n${section}\n\n${after}`.replace(/\n{3,}/g, "\n\n");
  writeFileSync(LOG_PATH, `${rebuilt.replace(/\s*$/, "")}\n`);
}

// --- CLI -------------------------------------------------------------------------------

async function main(argv = process.argv.slice(2)) {
  const queryIndex = argv.indexOf("--query");
  if (queryIndex !== -1) {
    const term = argv.slice(queryIndex + 1).join(" ").trim();
    if (!term) {
      console.error('Usage: node scripts/browser-feature-intel.mjs --query "<term>"');
      process.exitCode = 1;
      return;
    }
    runQuery(term);
    return;
  }
  await runScheduled();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err?.message ?? err);
    process.exitCode = 1;
  });
}
