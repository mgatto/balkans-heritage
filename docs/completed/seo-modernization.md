# Plan: Modern SEO & discoverability

**Status:** In progress — on-page SEO is now complete across all five pages (landed 2026-08-19): generated `sitemap.xml`/`rss.xml`/`robots.txt` (Pillars 1 & 7), unique `<meta name="description">` and a standardized `<title>` convention (Pillar 2), `<link rel="canonical">` on every page (Pillar 1), and per-page Open Graph + Twitter Card tags with per-landmark 1200×630 images (Pillar 4). Performance and accessibility (Pillars 5-6) are audited: accessibility passes (pa11y-ci/axe 5/5 URLs, 0 errors) and Lighthouse SEO/best-practices/accessibility clear the 0.9 gate; mobile **performance** on the image-heavy landmark pages still sits below 0.9 (raw hero-JPEG byte weight), pending responsive-image/recompression work now owned by [`../future/asset-loading-optimization.md`](../future/asset-loading-optimization.md). Only multilingual/`hreflang` (see Still open) remains.
**Scope:** `src/*.html`, `src/public/`, build config
**Related:** [`schema-org-structured-data.md`](../completed/schema-org-structured-data.md)

## Framing

This is a **technical / developer-led SEO effort** — the kind of on-page and infrastructure work a web developer owns to make the site correctly crawlable, indexable, shareable, and understandable by search engines and other machine consumers. It is explicitly **not** a marketing-agency campaign: no ad spend, keyword-buying, link-farming, backlink outreach, or content-marketing calendar. The goal is that the site is *technically excellent* and *honestly discoverable* on its own merits.

The [Schema.org / RDFa structured-data work](../completed/schema-org-structured-data.md) is one pillar of this larger effort — it makes each landmark machine-readable — but structured data alone is not "SEO." This document is the umbrella plan; the Schema.org doc is a sub-plan under it.

## Current state (audit)

- **Meta descriptions: done.** ✅ [2026-08-19] All five pages have unique, meaningful `<meta name="description">` (home landed 2026-08-18; the four landmark pages filled in on 2026-08-19).
- **Social/sharing metadata: done.** ✅ [2026-08-19] All five pages have Open Graph + Twitter Card tags. Each landmark uses its own stable 1200×630 image at `src/public/assets/img/og-<name>.jpg` (`og-bridge`/`og-mosque`/`og-fountain`/`og-monastery`, cover-cropped from the hero photo); home uses `og-home.jpg`. All served verbatim from `src/public/`, so their URLs aren't fingerprinted.
- **Canonical URLs: done.** ✅ [2026-08-19] `<link rel="canonical">` on every page, using the apex origin and **extensionless** landmark URLs (`https://balkanheritage.info/` for home, `/<page>` — e.g. `/bridge` — for landmarks). This matches what Cloudflare Workers (Static Assets) already treats as canonical: its default `auto-trailing-slash` html_handling serves `bridge.html` at `/bridge` (200) and 307-redirects `/bridge.html` → `/bridge`. Every crawler-facing signal (canonical, `og:url`, sitemap `<loc>`, RSS `link`/`id`) plus all internal links (nav, homepage grid, `rel="prev"`/`"next"` pagination) now point at the real 200 URL, with no reliance on the 307. Sitemap/RSS URLs derive from the `route` field in the `pages` registry (`vite.config.js`), which is extensionless; the source `file` keeps its `.html` name (the built artifact CF maps to).
- **`sitemap.xml` / `rss.xml` / `robots.txt`: now generated, not static.** ✅ They're produced at build time by `scripts/generate-seo-files.mjs` (wired via a `closeBundle` hook in `vite.config.js`) from the `pages` registry and the `SITE_URL` apex origin, written into `dist/` — no longer hand-maintained static copies in `src/public/`. This retired the previously stale files that pointed at `http://web.engr.oregonstate.edu/~gattom/` over HTTP and listed only the home page plus three PDF maps; the generated sitemap now covers every landmark page.
- **`llms.txt`: generated for AI/LLM discoverability.** ✅ [2026-08-21] Added to the same generator, so a curated Markdown overview of the site is emitted at the root for LLMs and AI agents — see Pillar 8.
- **Structured data is largely complete** — see the Schema.org sub-plan for the small remaining items.
- **Titles: standardized.** ✅ [2026-08-19] All five follow `<Page> - Balkan Heritage` (home: `Balkan Heritage - A Poetic Tour of the Balkans`), replacing the old terse `Balkan Heritage :: X` pattern.

## Pillars of the effort

1. **Crawlability & indexing**
   - ✅ **Done.** `robots.txt` and `sitemap.xml` are generated from the real production origin and the actual built pages, automated in the Vite build (`closeBundle`) so they can't drift.
   - ✅ **Done [2026-08-19].** `<link rel="canonical">` on every page (apex origin).
2. **On-page metadata**
   - ✅ **Done [2026-08-19].** Unique `<meta name="description">` on all five pages.
   - ✅ **Done [2026-08-19].** `<title>` standardized to `<Page> - Balkan Heritage`.
3. **Structured data** (see [`schema-org-structured-data.md`](../completed/schema-org-structured-data.md))
   - Complete and validate the Schema.org / RDFa markup.
4. **Social / sharing**
   - ✅ **Done [2026-08-19].** Open Graph + Twitter Card tags (title, description, image, url, type) on all five pages. Home uses `og-home.jpg`; each landmark uses its own 1200×630 `og-<name>.jpg` under `src/public/assets/img/` (cover-cropped from the hero photo, served verbatim so the URL isn't fingerprinted). Absolute URLs use the canonical apex origin. Refresh the preview via the LinkedIn Post Inspector after deploy (crawlers cache aggressively).
5. **Performance & Core Web Vitals**
   - ✅ **Audited [2026-08-19].** At audit time: landmark heroes use `fetchpriority="high"` + `decoding="async"` (LCP); the `ottoman/index.html` hub-grid thumbnails carry `width`/`height` + `loading="lazy"` + `decoding="async"`; Lighthouse SEO/best-practices/accessibility clear the 0.9 gate. *Note (superseded):* the home page (`src/index.html`) was later reworked into the Parts grid, whose images currently lack `loading`/`decoding` hints (CLS is still reserved via CSS `aspect-ratio`) — that regression is tracked as item 3 in [`../future/asset-loading-optimization.md`](../future/asset-loading-optimization.md), not here.
   - **Remaining:** mobile performance on the image-heavy landmark pages is still below 0.9 (bridge ~0.73, fountain ~0.76, monastery ~0.84) due to raw hero-JPEG byte weight (e.g. `prizren_bridge.jpg` ~948 KB). Fixing it needs recompression, modern formats (AVIF/WebP), and responsive images (`<picture>`/`srcset`) — now owned by [`../future/asset-loading-optimization.md`](../future/asset-loading-optimization.md) (which also covers the previously-untracked font/LCP `preload` hints). The Lighthouse gate is warn-only, so this doesn't block.
6. **Accessibility as SEO**
   - ✅ **Done [2026-08-19].** Descriptive `alt` on the homepage grid thumbnails (were `alt=""`), fixed a hero `alt` typo on `monastery.html`, verified heading order. `npm run a11y` passes (pa11y-ci/axe, 5/5 URLs, 0 errors).
   - Accessibility itself is now tracked as its own active workstream, not just an SEO side-effect — see [`docs/accessibility.md`](../accessibility.md) for the WCAG 2.2 AA standard and the `npm run a11y` (pa11y-ci/axe-core) pipeline.
7. **Feeds & syndication**
   - `rss.xml` stays and is generated from the `pages` registry (one item per page), so it stays accurate as new tour parts are published — see Decisions below.
8. **AI / LLM discoverability**
   - ✅ **Done [2026-08-21].** A generated `llms.txt` (the [llmstxt.org](https://llmstxt.org/) convention) is emitted at the site root alongside `sitemap.xml`/`rss.xml`/`robots.txt` from the same `pages` registry, giving LLMs and AI agents a curated Markdown overview. Its structure mirrors the tour — the site root is represented by the H1 and blockquote summary (not repeated as a link), an "Overview" section lists any other standalone top-level pages, one section per Part is titled by that Part's hub page (the entry whose `name === part`, the same hub convention the breadcrumb generator uses), and an "Optional" section links the feed/sitemap — so the planned Byzantine/Habsburg/Socialist parts are absorbed automatically. Unlike the sitemap/RSS (which use the registry's short descriptions), each `llms.txt` link uses the page's richer `<meta name="description">`, read from the source HTML with `htmlparser2` in its default forgiving HTML mode (not `xmlMode`) — a real parser, not a regex — and falls back to the registry description when a page has none.
   - ✅ **Done [2026-08-21].** `robots.txt` now explicitly welcomes the major AI/LLM crawlers (OpenAI, Anthropic, Perplexity, plus the `Google-Extended`/`Applebot-Extended` opt-out tokens, Common Crawl, ByteDance, Meta, Amazon) with per-agent `Allow: /` blocks. This is intentionally permissive — findability and citation over training opt-out (see Decisions) — and keeps those bots allowed even if a narrower `Disallow` is ever added under `User-agent: *`.

## Dependencies & ordering

- ✅ A **canonical production origin** was the blocking prerequisite for sitemap, canonical tags, robots, and OG `url`/`image`. It is now decided (`balkanheritage.info` — see Decisions), which unblocked the home-page OG work above and unblocks the rest.
- The Schema.org sub-plan can proceed in parallel but should be validated alongside the other on-page metadata.

## Validation

- `npm run lint:html` must stay green.
- Lighthouse SEO + Performance + Accessibility audits.
- [Google Rich Results Test](https://search.google.com/test/rich-results) for structured data.
- Social preview inspectors for Open Graph — e.g. the [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) (the site's primary share target) and the Facebook Sharing Debugger.
- Google Search Console coverage once a real domain is live.

## Decisions so far

Captured from the site owner; some remain open (see below).

- **Canonical domain & hosting:** ✅ *Decided.* Domain is `balkanheritage.info`, hosted on Cloudflare Workers (Static Assets). The apex is the sole canonical host (`SITE_URL` in `vite.config.js`); `www.balkanheritage.info` 301-redirects to it via a Cloudflare Redirect Rule rather than being a second custom domain. Deploys are published from the CLI via `npm run deploy` (`vite build && wrangler deploy`, configured in `wrangler.jsonc`) — see the "Deployment" section in `README.md`. All HTTPS, auto-provisioned by Cloudflare.
- **Search Console / analytics:** None for now. No analytics scripts to be added; no privacy/consent surface needed yet. (Search Console can be revisited once a real domain exists.)
- **Audience & language:** English-only today, **multilingual planned**. Build URL/canonical/sitemap tooling to be `hreflang`-ready so translations can be added later without rework.
- **Social sharing image:** **Per-page** — use each landmark's hero photo for its Open Graph / Twitter image; fall back to a site-wide image for pages without a hero (e.g. home).
- **Scope of ambition:** "Technically correct & honestly discoverable." Not chasing rankings for specific queries — no keyword-driven content depth beyond what the site naturally warrants.
- **Content cadence / automation:** **Automate now.** Generate `sitemap.xml`, structured data, and the feed from the actual built pages during the Vite build so the planned Habsburg and Socialist parts are absorbed automatically.
- **Feeds:** ✅ *Keep `rss.xml`; an "item" is each page in the registry* (home plus each landmark). It's generated at build time by `scripts/generate-seo-files.mjs` from the `pages` registry in `vite.config.js` (one `feed.addItem` per page), so new tour parts are absorbed automatically. Each item's publication date comes from an explicit `datePublished` field on the registry entry (seeded from each file's first commit), **not** the file's `mtime` — so editing an existing landmark no longer re-surfaces it at the top of the feed. The sitemap's `lastmod` still uses `mtime`, which is correct there (it genuinely means "last modified").
- **AI / LLM discoverability:** ✅ *Decided [2026-08-21].* Publish a generated `llms.txt` and explicitly **welcome all known AI crawlers** in `robots.txt` (training and search/retrieval alike). This is the same "honestly discoverable" stance as the rest of this effort — maximize findability and citation by AI assistants rather than opting out of model training. Both are generated at build time from the `pages` registry, so they stay in sync as Parts are added. `llms-full.txt` (a full-content dump) and in-`<head>` discovery links (`rel="describedby"`) were considered and **skipped** — the latter because `describedby` isn't a WHATWG-registered `<link>` relation and would risk the strict `npm run lint:html` gate; `llms.txt` is discoverable by convention at its well-known path, like `robots.txt`.

## Still open

1. **Multilingual specifics** (deferrable until translation begins) — which languages, and URL scheme (subpath `/de/`, subdomain, or query)?
