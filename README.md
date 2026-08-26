# Balkans Heritage

A small, hand-crafted static website — a **Poetic Tour of the Balkans** — celebrating the layered cultural heritage of the region across the empires and eras that shaped it. The tour is organized into parts by historical period, each highlighting points of interest with downloadable maps and imagery.

The site is built with [Vite](https://vitejs.dev/) as a multi-page app of static, standards-first HTML pages enhanced with a few lightweight, framework-free Web Components.

## The tour

The tour is structured as a series of parts, each covering a distinct period in the region's history:

- **Part I: The Byzantine** — planned. Sites and stories from the Byzantine (Eastern Roman) period.
- **Part II: The Ottoman Heritage** — the current focus, featuring a bridge in Prizren, a mosque and fountain in Sarajevo, and a monastery near Mostar. Lives under `/ottoman/`, with its own hub page.
- **Part III: The Habsburg** — planned. Sites and stories from the Austro-Hungarian period.
- **Part IV: The Socialist** — planned. Sites and stories from the socialist era, spanning both Tito's Yugoslavia and Hoxha's Albania (an era/political-system label, chosen so it can cover Albania — which was never part of Yugoslavia — alongside the Yugoslav republics).

Additional parts and points of interest are welcome — see [How to contribute](#how-to-contribute).

## Why this project?

- **Preserve and share culture.** The Balkans are often remembered for recent conflict; this project is a small effort to surface the region's deep history, art, and architecture instead.
- **Learn from a clean, dependency-light codebase.** No heavy front-end framework — just modern, standards-based HTML, CSS, and vanilla Web Components bundled with Vite.
- **Care about craft.** The project aims for strict HTML5 conformance, structured data via [Schema.org](https://schema.org/) expressed as inline [RDFa](https://www.w3.org/TR/rdfa-primer/), and accessible, semantic markup.

If you enjoy meticulous, standards-first web development — or you care about Balkan history and culture — you're very welcome to contribute.

## Built in the open

The craft decisions and dead-ends behind this site are written up as an ongoing developer journal — the *why* behind the RDFa linked-data work, the WCAG 2.2 accessibility tooling, and the dependency-light build. Follow it in the [Balkans Heritage category on mashqandmachine.com](https://mashqandmachine.com/category/balkans-heritage/), and read the [About page](https://balkanheritage.info/about) for the story behind the tour.

## Design principles

- **Strict HTML5 conformance** — validated markup (see `npm run lint:html`).
- **Progressive enhancement** — pages work as plain HTML; Web Components layer on extra behavior.
- **Structured data** — [Schema.org](https://schema.org/) vocabulary expressed as inline [RDFa](https://www.w3.org/TR/rdfa-primer/) attributes (`vocab`, `typeof`, `property`) on the semantic HTML, rather than a separate JSON-LD block.
- **Accessibility** — targets [WCAG 2.2](https://www.w3.org/TR/WCAG22/) Level AA; see [`docs/accessibility.md`](docs/accessibility.md) for the standard, automated verification (`npm run a11y`), and manual testing checklist.
- **Self-hosted fonts** — typefaces are vendored and served same-origin (no third-party font CDN) for privacy, reliability, and reproducible builds. See [Fonts](#fonts).
- **Minimal dependencies** — no front-end JavaScript framework; vanilla JS Web Components, layered on [Pico.css](https://picocss.com/) as a tiny, classless CSS baseline (no JS, styles semantic HTML).

## Project structure

```BASH
src/
  index.html              # Home / Parts index (a grid linking to each Part)
  ottoman/                # Part II: The Ottoman Heritage (nested, extensionless URLs under /ottoman/)
    index.html            #   Part hub page
    bridge.html           #   Point-of-interest pages
    mosque.html
    fountain.html
    monastery.html
  components/             # Framework-free Web Components (mast, navigation, footer)
  assets/                 # CSS, images, maps
  public/                 # Files copied verbatim to the site root (manifest.json, humans.txt, _redirects).
                           # _redirects 301s the old flat landmark URLs (/bridge, …) to their
                           # new nested /ottoman/ paths for Cloudflare Workers (Static Assets).
                           # manifest-icon.svg is a deliberate duplicate of
                           # src/assets/img/star_and_crescent.svg — manifest.json can't
                           # reference a fingerprinted (hashed) asset path, so this copy
                           # exists at a stable, unhashed path the manifest can point to.
                           # Kept at a distinct filename (not assets/img/...) so it can't
                           # collide with the fingerprinted copy used by <link> icon tags.
scripts/
  generate-seo-files.mjs  # Derives sitemap.xml, rss.xml, and robots.txt from the built pages
vite.config.js            # Multi-page build + HTML minification config
dist/                     # Build output (generated)
```

`sitemap.xml`, `rss.xml`, and `robots.txt` aren't stored as static files — they're generated by `scripts/generate-seo-files.mjs` (using the [`sitemap`](https://www.npmjs.com/package/sitemap) and [`feed`](https://www.npmjs.com/package/feed) libraries) from the `pages` registry in `vite.config.js`, wired into the build via a `closeBundle` hook, so they can't go stale as pages are added or renamed. That registry is also what drives `build.rollupOptions.input`, keeping the built pages and the SEO files in lock-step. The canonical production domain is a single constant (`SITE_URL` in `vite.config.js`, currently `https://balkanheritage.info`) — see [Deployment](#deployment) and `docs/future/seo-modernization.md`.

## Structured data (Schema.org)

Each point-of-interest page embeds machine-readable structured data using [Schema.org](https://schema.org/) vocabulary expressed as inline [RDFa](https://www.w3.org/TR/rdfa-primer/) attributes on the existing semantic HTML. This keeps the markup standards-first and progressively enhanced — the metadata rides along on the same elements that render the page, rather than living in a separate JSON-LD block.

The goal is to expose each landmark as machine-readable data for search engines, map and knowledge-graph consumers, and other tools — improving SEO and enabling richer results.

The main types and properties used are:

- [`TouristAttraction`](https://schema.org/TouristAttraction) / [`LandmarksOrHistoricalBuildings`](https://schema.org/LandmarksOrHistoricalBuildings) — declared on each page's `<main>` to describe the landmark itself.
- [`GeoCoordinates`](https://schema.org/GeoCoordinates) — a nested `geo` object carrying the landmark's `latitude` and `longitude`.
- [`ImageObject`](https://schema.org/ImageObject) — the hero image as a nested object with its own `contentUrl`, `creator`, `copyrightHolder`, and `license`, so image attribution attaches to the image rather than the landmark.
- [`sameAs`](https://schema.org/sameAs) — links each landmark to its [Wikidata](https://www.wikidata.org/) and [DBpedia](https://www.dbpedia.org/) entities, turning the page into a node in the global linked-data graph.
- [`subjectOf`](https://schema.org/subjectOf) → `CreativeWork` — attributes quoted descriptive text to its publisher (e.g. Lonely Planet, UNESCO).
- Dublin Core terms (`dc:source`, `dc:creator`, `dc:license`) — supplementary image attribution and licensing.

For example, `src/ottoman/bridge.html` sets the Schema.org vocabulary and Dublin Core prefix on `<body>` and marks up the landmark, its coordinates, and its linked-data identity:

```html
<body id="bridge" vocab="http://schema.org/" prefix="dc: http://purl.org/dc/terms/">
    <main typeof="TouristAttraction LandmarksOrHistoricalBuildings">
        <div property="geo" typeof="GeoCoordinates">
            <span property="latitude" content="42.20972222"></span>
            <span property="longitude" content="20.74027778"></span>
        </div>
        <span property="sameAs" resource="http://www.wikidata.org/entity/Q6085799"></span>
        ...
    </main>
</body>
```

Coordinates use an empty `<span … content="…">` rather than `<meta>` because `<meta>` is not valid HTML body content without a microdata `itemprop`; RDFa's `content` attribute works on any element.

You can inspect the extracted triples for every page with `npm run validate:rdfa`, or paste a page into the [W3C RDFa Play](https://rdfa.info/play/) / [Schema Markup Validator](https://validator.schema.org/).

> **Note:** The RDFa markup is substantially complete and consistent across all four landmark pages. A couple of image-source links remain unverified — see `docs/completed/schema-org-structured-data.md` for the remaining follow-ups.

## Fonts

The site's two typefaces — [EB Garamond](https://fonts.google.com/specimen/EB+Garamond) for headings and [Oswald](https://fonts.google.com/specimen/Oswald) for body text — are self-hosted rather than loaded from Google Fonts. The `woff2` files (including the `latin-ext` subset needed for Balkan diacritics such as č, ć, đ, š, and ž, plus a true EB Garamond italic) are vendored under `src/assets/fonts/` and declared with local `@font-face` rules in `src/assets/css/index.css`. Both families are licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/), whose text is committed alongside the files.

We self-host for three reasons:

- **Privacy.** Loading fonts from `fonts.googleapis.com` sends every visitor's IP address to Google on each request. A German court found this practice violated the GDPR when done without consent (LG Munich I, 20 Jan 2022, Az. 3 O 17493/20). Serving fonts from our own origin keeps visitor data on our side and removes one reason to need a consent prompt.
- **Performance.** Since browsers adopted HTTP cache partitioning (2020), a font fetched from Google's CDN is no longer shared across sites, so the old "it's probably already cached" benefit no longer applies. Self-hosting removes an extra DNS lookup and TLS handshake to a third-party origin, and the two-hop chain where CSS on `fonts.googleapis.com` points to files on `fonts.gstatic.com`, collapsing everything to same-origin requests.
- **Reliability and reproducibility.** Vendored fonts can't break from a third-party outage or a change to Google's API, and the build works offline and reproducibly with no runtime network dependency.

## Getting started

Requires [Node.js](https://nodejs.org/) (an `.nvmrc`/nvm-friendly setup is assumed) and npm.

```bash
# Install dependencies
npm install

# Start the dev server with hot reloading
npm run dev

# Produce a production build in dist/
npm run build

# Preview the production build locally
npm run preview
```

## Deployment

The site is hosted on [Cloudflare Workers (Static Assets)](https://developers.cloudflare.com/workers/static-assets/) and published from the CLI via [Wrangler](https://developers.cloudflare.com/workers/wrangler/):

```bash
npm run deploy   # vite build && wrangler deploy
```

`npm run deploy` intentionally runs `vite build` directly rather than `npm run build`, skipping the slow Lighthouse/accessibility `postbuild` gate. Run `npm run build` locally first as your pre-release quality check, then `npm run deploy` to ship. Deploy config (asset directory, custom domain route) lives in `wrangler.jsonc`.

### One-time setup checklist

These steps happen once, outside the repo:

- [x] Domain registered and zone Active on Cloudflare (purchased via Cloudflare Registrar).
- [x] `npx wrangler login` completed on the machine that deploys (stores an OAuth token locally — no repo secret needed).
- [x] First `npm run deploy` run — auto-attaches the `balkanheritage.info` apex custom domain and creates its proxied DNS record, with SSL provisioned automatically.
- [x] `www` to apex redirect created — Rules → Redirect Rules → 301 from hostname `www.balkanheritage.info` to `concat("https://balkanheritage.info", http.request.uri.path)`, preserve query string.
- [x] Proxied `www` DNS record exists (created by the redirect-rule flow, or added manually as a proxied placeholder) so `www` resolves to Cloudflare's edge.
- [x] Verified: `https://balkanheritage.info` serves the site and `https://www.balkanheritage.info` 301-redirects to it.

Only the apex is attached as a Worker custom domain — `www` is deliberately handled by the redirect rule instead of a second custom domain, so there is exactly one canonical host (matching `SITE_URL` in `vite.config.js` and the canonical URLs in the generated SEO files).

## Linting & formatting

Please run the linters before opening a pull request:

```bash
npm run lint:html     # validate HTML
npm run lint:css      # lint CSS
npm run lint:js       # lint JS/JSON
npm run lint:fix      # auto-fix JS and CSS where possible
npm run a11y          # check accessibility (axe-core via Puppeteer) against a production build
npm test              # run the Vitest suite (scripts/*.mjs)
```

Git hooks (via [Husky](https://typicode.github.io/husky/)) run `lint-staged` on commit and `npm test` on push. Test coverage currently spans the pure-Node build scripts (`scripts/generate-seo-files.mjs`, `scripts/validate-rdfa.mjs`) — the Web Components in `src/components/` aren't covered yet; contributions that extend coverage are welcome.

## How to contribute

Contributions of all kinds are welcome: content and translations, accessibility improvements, bug fixes, new points of interest, design polish, and tests.

1. **Fork** the repository and clone your fork locally.
2. **Create a branch** for your change:

   ```bash
   git checkout -b feature/short-description
   ```

3. **Make your changes.** Keep them focused and follow the design principles above.
4. **Lint locally** with the commands in [Linting & formatting](#linting--formatting) and confirm the site still builds (`npm run build`).
5. **Commit** with a clear, descriptive message.
6. **Push** your branch and **open a Pull Request** against the `main` branch of this repository.

### Pull request guidelines

- Keep PRs small and focused on a single change where possible.
- Describe **what** you changed and **why** in the PR description; link any related [issues](https://github.com/mgatto/balkans-heritage/issues).
- Ensure HTML validates and CSS/JS lint cleanly.
- Include screenshots for visual/UI changes.
- Be respectful and constructive in reviews and discussion.

Not ready to write code? Opening an [issue](https://github.com/mgatto/balkans-heritage/issues) with a bug report, correction, or idea is a great way to help.

## Cross-browser testing

This project is tested with BrowserStack.

Real-browser rendering checks run against [BrowserStack](https://www.browserstack.com/), whose Open Source program generously supports this project. Keeping this repository public and retaining this attribution are conditions of that free access.

Screenshots of every page are captured on real browsers and devices via [BrowserStack Automate](https://www.browserstack.com/automate) — real Safari, iOS Safari, Edge, and more, not an approximation — using a small script (`scripts/browserstack-screenshots.mjs`) driven by `selenium-webdriver` (a WebDriver client, not a test-runner framework). Automate exposes the current real-browser/device grid, so these are up-to-date renders rather than the stale pool the older Screenshots API was limited to. The resulting PNGs land in a gitignored `screenshots/<timestamp>/` directory for manual visual review; there is no automated pass/fail comparison yet (the follow-up baseline/diff layer is planned in [`docs/future/visual-regression-testing.md`](docs/future/visual-regression-testing.md)). This is a manual, credential-gated command, deliberately kept out of `npm test` and the pre-push hook. Percy, Playwright, and `browserslist-browserstack` are intentionally not used.

### Setup

Copy `.env.example` to `.env` (gitignored) and fill in your BrowserStack credentials, or export them in your shell. The access key also serves as the BrowserStack Local tunnel key.

```bash
BROWSERSTACK_USERNAME=your-username
BROWSERSTACK_ACCESS_KEY=your-access-key
```

### Commands

```bash
npm run bs:screenshots         # capture the deployed site (https://balkanheritage.info)
npm run bs:screenshots:local   # build + serve locally, capture over a BrowserStack Local tunnel
npm run bs:browsers            # list the account's available browsers/devices (to curate the matrix)
```

The browser/OS matrix lives in `.browserstack-browsers.json` — a small set of in-use browsers (loosely based on the Browserslist `defaults` query, Samsung Internet excluded) expressed as BrowserStack Automate capabilities: desktop entries as `browserName`/`browserVersion` plus `os`/`osVersion`, real-mobile entries as `deviceName`/`osVersion`/`realMobile`. Desktop browsers are captured at two resolutions (widescreen `1920x1080` and normal `1280x1024`); mobile devices are captured once at their native size, portrait. This matrix is deliberately narrower than, and decoupled from, the `browserslist` field in `package.json` that drives the build target and compatibility linting.

Captures are viewport-only. WebDriver's `takeScreenshot()` is viewport-only on every real browser/device, so the script does not attempt full-page stitching — this keeps output deterministic across the matrix (a deliberate change from the old Screenshots API, which returned full-page images). Sessions run up to 4 in parallel, under the OSS program's 5-parallel cap.

Browser versions use `latest`, so BrowserStack always renders on the current release; `latest` will drift over time (fine for manual sanity screenshots, but a baseline-diff layer would need pinned versions — see [`docs/future/visual-regression-testing.md`](docs/future/visual-regression-testing.md)). Run `npm run bs:browsers` to see the exact browsers/devices the account can drive.

Each run also writes a `manifest.json` into its `screenshots/<timestamp>/` directory recording the target URL, mode, and — per capture — the Automate session ID, dashboard URL, resolution/orientation, saved file path, and status (with the error message on failures). It's a self-contained record for re-inspecting a run later, and is written even if the run fails partway through.

## License

Released under the [MIT License](https://opensource.org/licenses/MIT) — see [LICENSE](LICENSE).
