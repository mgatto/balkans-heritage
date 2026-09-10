# Agent Guidelines

Operating notes for AI agents and new contributors. For project overview, structure, design principles, and contribution flow, see `README.md` — this file only adds rules, commands, and gotchas not covered there.

## Environment

- **Operating System**: macOS (Darwin architecture).
- **OS Version**: Sequoia (15.7.9)
- **Default Shell**: zsh.
- **Command Style**: Native macOS/BSD-style command-line utilities.
- **Syntax Constraint**: Do not use Linux GNU-specific flags or extensions (e.g., avoid GNU-style `--help` or `sed -i` without an empty string extension).
- **Tooling Rule**: Write all terminal commands, shell scripts, and automation tasks using standard BSD syntax to ensure native compatibility.
- Node.js `v24.20.0` (see `.nvmrc`; `nvm use` to match).
- Install dependencies with `npm install`.
- **nvm is required to get `node`/`npm` on `PATH`.** This repo pins Node via nvm, so `node` and `npm` are not globally installed — they live under `~/.nvm/versions/node/<version>/bin`. Interactive login shells load nvm automatically, but **non-interactive shells (CI steps, agent-run commands, `sh -c`, cron) do not**, so `npm` will fail with `command not found`. In those contexts, source nvm and select the pinned version first:

```sh
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use            # reads .nvmrc; installs the version first if missing (`nvm install`)
```

  Prepend this to any session that runs `npm ...`, or invoke the pinned binaries directly (e.g. `~/.nvm/versions/node/v24.20.0/bin/npm run build`) if sourcing isn't possible.

## Commands

- `npm run dev` — start the Vite dev server with hot reloading.
- `npm run build` — produce a production build in `dist/`. **Slow**: its `postbuild` hook runs Lighthouse (desktop + mobile) and `a11y`. For a quick "does it build" check use `npx vite build` (which `npm run deploy` also runs directly, skipping the gate).
- `npm run preview` — preview the production build locally.
- `npm run deploy` — `vite build && wrangler deploy --tag $(git describe --tags --always) --message "Release $(git describe --tags --always)"` to Cloudflare Workers (Static Assets). Runs `vite build` directly, bypassing `postbuild`; run `npm run build` first as your pre-release gate. The `git describe` value (e.g. `v2.4.0`, or `v2.4.0-3-g<sha>` for post-release commits) is recorded as the Wrangler version tag and deployment message — visible in `npx wrangler deployments list`.
- `npm run lint:html` — validate HTML with `html-validate`.
- `npm run lint:css` — lint CSS with Stylelint.
- `npm run lint:js` — lint JS/JSON with ESLint.
- `npm run lint:fix` — auto-fix JS and CSS where possible.
- `npm run a11y` — check accessibility (axe-core via Puppeteer, `scripts/a11y.mjs`) against a production build; runs automatically after `npm run build`.
- `npm run check:links` — verify user-facing external `<a href>` links in `src/**/*.html` (manual, network-dependent; redirects are logged to gitignored `link-check-redirects.log`, and the content/squatting check is warn-only). Not wired into lint-staged/pre-push. See `docs/future/external-link-checking.md`.
- `npm run intel:browser-features` — scan for newly-landed HTML/CSS/Web-API features (Baseline via `web-features`, enriched with `caniuse-lite`, plus browser-vendor release notes and blog posts) and append findings to `docs/browser-feature-intel-log.md`. Occasional, warn-only; not wired into the build. See `docs/browser-feature-intel.md`.
- `npm run intel:query -- "<term>"` — read-only ad-hoc lookup of a single feature's Baseline status and per-browser support (falls back to `@mdn/browser-compat-data` when uncurated); writes nothing.
- `npm run release` — bump `version` in `package.json`, update `CHANGELOG.md`, and tag the release from Conventional Commit history since the last tag. See `docs/versioning.md`.
- `npm test` — run the Vitest suite once (`vitest run`); enforced by the `pre-push` hook. `npm run test:watch` reruns on change for local dev.
- `npm run validate:rdfa` — extract and print the RDFa triples for each page (verifies the Schema.org structured data is well-formed).

Always run the linters and `npm test` before finishing a change.

## Version control

- **Never commit to Git, and never offer to.** Agents must not run `git commit` (or `git add`/`git push`/`git tag`, etc.), and must not suggest, propose, or ask whether to commit. Leave all staging, committing, and pushing to the human. Make your file changes and stop there; the human reviews the working tree and commits when they decide to.

## Project conventions

- **Strict HTML5 conformance.** All markup must pass `npm run lint:html`. Don't introduce non-conforming HTML.
- **No front-end JavaScript framework.** Vanilla JS Web Components only (see `src/components/`). Don't add a JS UI framework (React/Vue/Angular/Svelte/etc.) — these own the render loop and abstract away the HTML. A *classless* CSS baseline (Pico.css) is permitted — it ships no JavaScript and styles semantic HTML directly, so it fits the standards-first ethos — but JS UI frameworks remain disallowed. **JS libraries are allowed** — the ban is on frameworks, not libraries. A focused, do-one-thing library (small, dependency-light, no framework runtime) may be used when it earns its keep, provided it doesn't break progressive enhancement (core content must not depend on it) and keeps the codebase dependency-light. Prefer the platform first; reach for a library only when the browser doesn't already do the job well.
- **CSS class naming: kebab-case, never BEM.** Use plain kebab-case for every class selector (`glossary-ipa`, `glossary-popover-ipa`, `glossary-term-local`). BEM `__`/`--` names (`glossary__ipa`, `glossary-term--local`) are banned — encode any block/element/modifier meaning into the kebab name itself. Enforced by Stylelint's `selector-class-pattern` (via `stylelint-config-standard`); `npm run lint:css` fails on `__`/`--`. This applies even when a plan or external snippet is written in BEM — translate it to kebab-case.
- **Progressive enhancement.** Pages must work as plain HTML; Web Components only layer on extra behavior. Don't make core content depend on JS.
- **Structured data.** Preserve and extend the inline RDFa Schema.org markup (`vocab`, `typeof`, `property`). Don't strip these attributes. This is an active, incomplete effort — see `docs/completed/schema-org-structured-data.md` before touching it.
- **Accessibility.** Targets WCAG 2.2 Level AA — see `docs/accessibility.md` for the standard, tooling caveats, and manual checklist. Don't treat a clean `npm run a11y` run as sufficient on its own; it's warn-only and doesn't catch everything.
- **Typography encoding.** Displaying a character? → literal UTF-8 (`…`, `—`, `’`, `č`, `ş`, …). Escaping a character that has syntactic meaning to the parser? → entity (`&lt;`, `&gt;`, `&amp;`, `&quot;` in quoted attributes, `&nbsp;` when non-breaking space is truly required).
- **Commit messages.** Follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.) — enforced by commitlint on every commit via a Husky `commit-msg` hook. The `version` field in `package.json` is bumped from this history, not by hand — see `docs/versioning.md`.

## Gotchas

- **Adding a page** requires adding an entry to the `pages` registry in `vite.config.js`. That registry is the single source of truth: it derives `build.rollupOptions.input` (so the page is built at all) *and* feeds the generated `sitemap.xml`/`rss.xml`/`llms.txt` (routes, RSS title/description) *and* drives the `inject-registry-nav` plugin (prev/next `<link rel="prev"/"next">` pagination, breadcrumbs, and the country facet). Miss it and the page is silently excluded from the build, the SEO files, and site navigation. Array order is load-bearing: it is the tour reading order, from which prev/next is derived. `part`/`country` must be in the controlled vocabularies (`PARTS`/`COUNTRIES`) or the build fails — see `docs/future/information-architecture.md`.
- **Prev/next, breadcrumbs, and the country facet are generated, not hand-authored.** The `inject-registry-nav` Vite plugin injects them at build time from the `pages` registry (it fully replaced the old hand-maintained pagination `<link>`s and the `preserve-pagination-links` workaround they needed). Don't hand-write these into HTML or "restore" the old static links.
- **`src/public/`** is copied verbatim to the site root (manifest, `humans.txt`, `_redirects`, `_headers`). Audio files live under `src/public/assets/audio/{al,bs}/` and are copied to `dist/assets/audio/` — they won't exist in `src/assets/` during development.
- **`sitemap.xml` / `rss.xml` / `llms.txt` / `robots.txt` are generated, not static.** `vite.config.js`'s `generate-seo-files` plugin calls `scripts/generate-seo-files.mjs` in a `closeBundle` hook after every `npm run build`, so they can't drift as pages are added/renamed. It builds them from the `pages` registry using the `sitemap` and `feed` libraries (not by scraping HTML), so change page metadata in the registry, not the generated output. Don't add static copies of these files back to `src/public/`. The canonical domain is the single `SITE_URL` constant in `vite.config.js` (`https://balkanheritage.info`).
- **`dist/`** is generated by the build. Never edit it by hand.
- **`version` in `package.json` and `CHANGELOG.md` are generated by `npm run release`.** Don't hand-edit either — they're derived from Conventional Commit history since the last git tag (see `docs/versioning.md`).
- **`docs/future/`** holds planning notes for not-yet-started work; treat these as design intent, not current behavior.
- **Vitest runs two projects (`vitest.config.mjs`).** A `scripts` project (`node` env, `scripts/**/*.test.mjs`) and a `components` project (`jsdom` env, `src/components/**/*.test.js`, co-located next to each component). Gotchas when writing component tests: (1) the `.html?inline` import used by `Footer.js` is handled by a small `html-inline-test` plugin in the test config (Vite has no native `?inline` for HTML); (2) `__NAV_PAGES__` is `define`d to `globalThis.__NAV_PAGES__`, so set `globalThis.__NAV_PAGES__` per-test before mounting `<balkans-navigation>`; (3) small SVG assets are inlined as `data:` URIs, so assert medallion presence/distinctness, not a filename; (4) the `components` project enforces 90% V8 coverage on `src/components/**` — the run fails below that. The rendering side (computed CSS, focus, paint) stays with the real-browser/VRT track: `docs/engineering-practices.md`, `docs/future/visual-regression-testing.md`.
- **Biome is a Homebrew binary, not an npm dependency.** `biome.jsonc` is real, active config (formatter + a11y-recommended linter), but `biome` is deliberately absent from `package.json` and `node_modules` — it runs from the globally installed Homebrew binary (`/opt/homebrew/bin/biome`, currently v2.5.12). There is no npm script for it and it is not wired into lint-staged or the Husky hooks; the enforced gates remain ESLint/Stylelint/html-validate. Run it ad hoc with `biome lint <path>` (or `npx @biomejs/biome lint`, which downloads it). Its diagnostics may surface in editor/LSP sessions with opinions the npm linters don't share (e.g. `useBlockStatements` braces) — don't "fix" repo code to satisfy Biome-only style rules. HTML suppressions use the comment form `<!-- biome-ignore lint/a11y/useMediaCaption: reason -->`; the ones above the glossary `<audio>` clips are intentional (see `docs/future/fix/a11y_audio-track.md`) — don't remove or "clean up" them.

## Markdown

- Do not insert hard line breaks within paragraphs. Keep each paragraph on a single line and let it soft-wrap; only break lines between distinct blocks (paragraphs, list items, headings, code fences).
