# Balkans Heritage

A small, hand-crafted static website — a **Poetic Tour of the Balkans** — celebrating the layered cultural heritage of the region across the empires and eras that shaped it. The tour is organized into parts by historical period, each highlighting points of interest with downloadable maps and imagery.

The site is built with [Vite](https://vitejs.dev/) as a multi-page app of static, standards-first HTML pages enhanced with a few lightweight, framework-free Web Components.

## The tour

The tour is structured as a series of parts, each covering a distinct period in the region's history:

- **Part I: The Ottoman Heritage** — the current focus, featuring a bridge in Prizren, a mosque and fountain in Sarajevo, and a monastery near Mostar.
- **The Byzantine** — planned. Sites and stories from the Byzantine (Eastern Roman) period.
- **The Habsburg** — planned. Sites and stories from the Austro-Hungarian period.
- **The Yugoslav** — planned. Sites and stories from the Yugoslav era.

Additional parts and points of interest are welcome — see [How to contribute](#how-to-contribute).

## Why this project?

- **Preserve and share culture.** The Balkans are often remembered for recent conflict; this project is a small effort to surface the region's deep history, art, and architecture instead.
- **Learn from a clean, dependency-light codebase.** No heavy front-end framework — just modern, standards-based HTML, CSS, and vanilla Web Components bundled with Vite.
- **Care about craft.** The project aims for strict HTML5 conformance, structured data via [Schema.org](https://schema.org/) expressed as inline [RDFa](https://www.w3.org/TR/rdfa-primer/), and accessible, semantic markup.

If you enjoy meticulous, standards-first web development — or you care about Balkan history and culture — you're very welcome to contribute.

## Design principles

- **Strict HTML5 conformance** — validated markup (see `npm run lint:html`).
- **Progressive enhancement** — pages work as plain HTML; Web Components layer on extra behavior.
- **Structured data** — [Schema.org](https://schema.org/) vocabulary expressed as inline [RDFa](https://www.w3.org/TR/rdfa-primer/) attributes (`vocab`, `typeof`, `property`) on the semantic HTML, rather than a separate JSON-LD block.
- **Minimal dependencies** — no front-end framework; vanilla JS Web Components only.

## Project structure

```BASH
src/
  index.html              # Home / tour entry point
  bridge.html             # Point-of-interest pages
  mosque.html
  fountain.html
  monastery.html
  components/             # Framework-free Web Components (mast, navigation, footer, carousel)
  assets/                 # CSS, images, maps
  public/                 # Files copied verbatim to the site root (manifest, robots.txt, etc.)
vite.config.js            # Multi-page build + HTML minification config
dist/                     # Build output (generated)
```

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

For example, `src/bridge.html` sets the Schema.org vocabulary and Dublin Core prefix on `<body>` and marks up the landmark, its coordinates, and its linked-data identity:

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

> **Note:** The RDFa markup is substantially complete and consistent across all four landmark pages. A couple of image-source links remain unverified — see `docs/future/schema-org-structured-data.md` for the remaining follow-ups.

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

## Linting & formatting

Please run the linters before opening a pull request:

```bash
npm run lint:html     # validate HTML
npm run lint:css      # lint CSS
npm run lint:js       # lint JS/JSON
npm run lint:fix      # auto-fix JS and CSS where possible
```

Git hooks (via [Husky](https://typicode.github.io/husky/)) run `lint-staged` on commit. There is no automated test suite yet, so the `pre-push` hook is currently a no-op — contributions that add tests are welcome.

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

Real-browser rendering checks run against [BrowserStack](https://www.browserstack.com/), whose Open Source program generously supports this project.

## License

Released under the [MIT License](https://opensource.org/licenses/MIT) — see [LICENSE](LICENSE).
