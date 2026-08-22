// Generates llms.txt, sitemap.xml, rss.xml, and robots.txt from an explicit page
// registry (defined alongside build.rollupOptions.input in vite.config.js) so they
// can't drift out of sync as pages are added, renamed, or removed. Invoked from
// vite.config.js's `closeBundle` hook during `npm run build`.
//
// XML generation is delegated to maintained libraries rather than hand-rolled
// strings: `sitemap` for the sitemap, `feed` for the RSS feed. The sitemap's and
// RSS feed's per-page metadata (title, short description) come from the registry,
// not the HTML. llms.txt is the deliberate exception: it pulls each page's richer
// `<meta name="description">` from the source HTML, parsed with `htmlparser2` (a
// real HTML parser, in its default forgiving HTML mode — not `xmlMode`, so it
// matches the site's HTML5 tag-omission markup) rather than a regex, so there's
// still no fragile regex/entity/comment handling. robots.txt is a few lines of
// plain text, so it's assembled directly from the SITE_URL constant.

import { Feed } from "feed";
import { Parser } from "htmlparser2";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { SitemapStream, streamToPromise } from "sitemap";

const CHANNEL_TITLE = "Poetic Tour of the Balkans";
const CHANNEL_DESCRIPTION =
  "A poetic tour of the Balkans' layered cultural heritage, landmark by landmark.";

// llms.txt (llmstxt.org) header: the H1 site name and the standing context
// paragraph that follows the blockquote summary.
const SITE_TITLE = "Balkan Heritage";
const SITE_CONTEXT =
  "The tour is organized into historical Parts — Byzantine, Ottoman, Habsburg, and Socialist — each exploring the region's heritage from that era, landmark by landmark. Part II, the Ottoman Heritage, is published today; the other Parts are planned.";

// Well-documented AI/LLM crawler user-agent tokens we explicitly welcome in
// robots.txt. Intentionally permissive — the goal is findability and citation by
// AI assistants, so both training crawlers and search/retrieval crawlers are
// allowed. Crawlers match their token as a substring, so the bare name suffices.
// Grouped by operator for maintenance; array order is the emit order.
const AI_CRAWLERS = [
  // OpenAI
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  // Anthropic
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  // Perplexity
  "PerplexityBot",
  "Perplexity-User",
  // Google (Gemini training opt-out token)
  "Google-Extended",
  // Apple (Apple Intelligence opt-out token)
  "Applebot-Extended",
  // Common Crawl (corpus used by many models)
  "CCBot",
  // ByteDance
  "Bytespider",
  // Meta
  "meta-externalagent",
  // Amazon
  "Amazonbot",
];

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Pull a page's richer `<meta name="description">` out of its source HTML for
// llms.txt. Parsed with htmlparser2 in its default forgiving HTML mode (not
// xmlMode), so it correctly handles HTML5 tag-omission/void-element markup,
// attribute order, line-wrapped attributes, and HTML entities — and won't be
// fooled by a commented-out <meta>. Returns null when there's no usable
// description, so the caller can fall back to the registry's short description.
function extractRichDescription(srcDir, file) {
  const html = readFileSync(resolve(srcDir, file), "utf-8");

  let description = null;
  const parser = new Parser({
    onopentag(name, attributes) {
      if (
        description === null &&
        name === "meta" &&
        attributes.name?.toLowerCase() === "description" &&
        typeof attributes.content === "string"
      ) {
        description = attributes.content.trim();
      }
    },
  });
  parser.write(html);
  parser.end();

  return description || null;
}

// Home gets top priority; every other page a notch below.
function priorityFor(route) {
  return route === "/" ? 1.0 : 0.8;
}

function lastModified(srcDir, file) {
  return statSync(resolve(srcDir, file)).mtime;
}

async function renderSitemap(pages, siteUrl, srcDir) {
  const stream = new SitemapStream({ hostname: siteUrl });

  for (const page of pages) {
    stream.write({
      url: page.route,
      changefreq: "monthly",
      priority: priorityFor(page.route),
      lastmod: lastModified(srcDir, page.file).toISOString(),
    });
  }
  stream.end();

  const xml = (await streamToPromise(stream)).toString();
  return `${xml}\n`;
}

function renderRss(pages, siteUrl) {
  const feed = new Feed({
    title: CHANNEL_TITLE,
    description: CHANNEL_DESCRIPTION,
    id: `${siteUrl}/`,
    link: `${siteUrl}/`,
    language: "en",
    generator: "balkans-heritage build",
    copyright: `Copyright ${new Date().getFullYear()} Michael Gatto`,
  });

  for (const page of pages) {
    const url = `${siteUrl}${page.route}`;
    // Explicit publication date from the registry, not the file's mtime, so
    // editing an existing page doesn't bump it to the top of the feed. Guard
    // against a missing/invalid value so a forgotten field fails the build
    // loudly instead of emitting an `Invalid Date` into the feed.
    const date = new Date(page.datePublished);
    if (Number.isNaN(date.getTime())) {
      throw new Error(
        `Page "${page.name}" has a missing or invalid \`datePublished\` (${JSON.stringify(page.datePublished)}). ` +
          'Add an ISO date (e.g. "2025-06-06") to its entry in the `pages` registry in vite.config.js.',
      );
    }
    feed.addItem({
      title: page.title,
      id: url,
      link: url,
      description: page.description,
      date,
    });
  }

  return `${feed.rss2()}\n`;
}

// llms.txt per the llmstxt.org spec: an H1 site name and a blockquote summary
// (the only required structure), a short context paragraph, then H2 "file list"
// sections. The site root ("/") is deliberately omitted from the file lists — it's
// already represented by the H1 and the blockquote summary, so listing it again
// would just repeat that text. Any other page with no `part` goes under "Overview";
// each Part gets its own section, titled by its hub page — the entry whose
// `name === part`, the same hub-lookup convention vite.config.js uses for
// breadcrumbs — so new Parts (Byzantine/Habsburg/Socialist) are absorbed
// automatically. A trailing "Optional" section links the secondary feed/sitemap
// resources an agent can skip.
function renderLlmsTxt(pages, siteUrl, srcDir) {
  const describe = (page) =>
    extractRichDescription(srcDir, page.file) ?? page.description;
  const linkItem = (page) =>
    `- [${page.title}](${siteUrl}${page.route}): ${describe(page)}`;

  const home = pages.find((page) => page.route === "/");

  const lines = [`# ${SITE_TITLE}`, "", `> ${home ? describe(home) : CHANNEL_DESCRIPTION}`, "", SITE_CONTEXT];

  const topLevel = pages.filter((page) => !page.part && page.route !== "/");
  if (topLevel.length > 0) {
    lines.push("", "## Overview", "");
    for (const page of topLevel) lines.push(linkItem(page));
  }

  const partsInOrder = [];
  for (const page of pages) {
    if (page.part && !partsInOrder.includes(page.part)) partsInOrder.push(page.part);
  }
  for (const part of partsInOrder) {
    const hub = pages.find((page) => page.name === part);
    lines.push("", `## ${hub ? hub.title : titleCase(part)}`, "");
    for (const page of pages.filter((p) => p.part === part)) lines.push(linkItem(page));
  }

  lines.push(
    "",
    "## Optional",
    "",
    `- [RSS feed](${siteUrl}/rss.xml): New landmarks and Parts as they're published.`,
    `- [Sitemap](${siteUrl}/sitemap.xml): Every canonical page URL.`,
  );

  return `${lines.join("\n")}\n`;
}

function renderRobots(siteUrl) {
  // Explicit per-crawler blocks welcoming known AI/LLM bots. Redundant with the
  // wildcard `Allow: /` for today's rules, but it documents the intent (we want AI
  // assistants to find and cite the site) and keeps those bots allowed even if a
  // narrower `Disallow` is ever added under `User-agent: *`.
  const aiBlocks = AI_CRAWLERS.map((bot) => `User-agent: ${bot}\nAllow: /\n`).join("\n");

  return `# Generated during \`npm run build\` — do not edit by hand.
User-agent: *
Allow: /

# AI/LLM crawlers are explicitly welcomed (findability over training opt-out).
${aiBlocks}
Sitemap: ${siteUrl}/sitemap.xml
`;
}

/**
 * @param {object} options
 * @param {Array<{name: string, file: string, route: string, title: string, description: string, datePublished: string}>} options.pages
 *   the page registry shared with `build.rollupOptions.input` in vite.config.js.
 * @param {string} options.siteUrl - canonical origin, no trailing slash.
 * @param {string} options.srcDir - absolute path to the `src` directory (used for sitemap lastmod mtimes and for reading each page's `<meta name="description">` for llms.txt).
 * @returns {Promise<Record<string, string>>} filename -> file contents (llms.txt, sitemap.xml, rss.xml, robots.txt), ready to write into `dist/`.
 */
export async function generateSeoFiles({ pages, siteUrl, srcDir }) {
  return {
    "llms.txt": renderLlmsTxt(pages, siteUrl, srcDir),
    "sitemap.xml": await renderSitemap(pages, siteUrl, srcDir),
    "rss.xml": renderRss(pages, siteUrl),
    "robots.txt": renderRobots(siteUrl),
  };
}
