# Plan: Asset loading & image delivery optimization

**Status:** Done — landed August 2026. All four work items shipped: source JPEGs recompressed and served as AVIF/WebP with a JPEG fallback via `<picture>`; width-descriptor `srcset`/`sizes` responsive variants (480–1200w) generated for every rendered image; the home Parts grid finished with `loading="lazy"`/`decoding="async"`/intrinsic `width`/`height`; and fingerprint-safe build-time `preload` hints for the two above-the-fold fonts and the LCP hero image (typed `image/avif`) injected by a `vite.config.js` plugin. Remaining verification: confirm the image-heavy landmark pages clear the Lighthouse mobile 0.9 gate via a real-browser run (warn-only, non-blocking). Open Q3 (the 7.5 MB downloadable wallmap) is intentionally left off the render path. Kept for historical rationale.
**Scope:** `src/*.html`, `src/ottoman/*.html`, `src/assets/img/`, `src/assets/fonts/`, `src/assets/css/index.css`, `vite.config.js` / a possible `postbuild` step
**Related:** [`html-webcomponents-mastery-checklist.md`](../future/html-webcomponents-mastery-checklist.md) (owns learning the `<picture>` / `loading` / `decoding` / `fetchpriority` *features*), [`seo-modernization.md`](./seo-modernization.md) (Pillar 5 audit; its "Remaining" image-weight item now points here), [`optimization-opportunities.md`](../future/optimization-opportunities.md), [`../engineering-practices.md`](../engineering-practices.md), [`../learning-plan.md`](../learning-plan.md), [`container-image-packaging.md`](../future/container-image-packaging.md) (Brotli/gzip pre-compression of *text* assets — complementary, not the same as image work)

## Background

Resource discovery and loading is by far the largest visitor-facing cost on this photography-heavy site — it dwarfs anything in the HTML/CSS/JS payload — yet the work to address it was split across three documents with two real gaps. This doc is the single owner for image delivery (recompression, modern formats, responsive variants) and for resource hints (`preload`, `modulepreload`), so the pieces stop drifting apart. The feature-*learning* angle (mastering `<picture>`, `loading`, `decoding`, `fetchpriority`) deliberately stays in `html-webcomponents-mastery-checklist.md`; the delivery/performance ownership is here.

Why consolidate now: (1) responsive images + recompression were only cross-referenced from `seo-modernization.md`'s "Remaining" note into the WC checklist, with no owning plan and no mention of modern formats; (2) `preload` of the above-the-fold fonts and the LCP hero image was tracked *nowhere*; (3) `seo-modernization.md`'s Pillar 5 claim that "all `<img>` carry intrinsic `width`/`height` … homepage grid uses `loading="lazy"`" is now overstated — the home Parts grid was reworked after that 2026-08-19 audit and its images lost those hints.

## Current state (audit)

Rendered images and their raw byte weight (from `dist/assets/`):

| Image | Size | Where rendered | Current `<img>` hints |
| --- | --- | --- | --- |
| `prizren_bridge.jpg` | ~948 KB | `bridge.html` hero + `ottoman/index.html` hub grid | hero: `width`/`height`/`fetchpriority="high"`/`decoding="async"`; grid: `width`/`height`/`loading="lazy"`/`decoding="async"` |
| `fountain2.jpg` | ~689 KB | `fountain.html` hero + hub grid | same pattern as above |
| `blagaj_tekke.jpg` | ~428 KB | `monastery.html` hero + hub grid | same pattern as above |
| `gracanica_monastery.jpg` | ~346 KB | home Parts grid (`src/index.html`) | **none** — bare `<img src alt="">` |
| `national_library_kosovo.jpg` | ~323 KB | home Parts grid | **none** |
| `croatian_national_theatre.jpg` | ~205 KB | home Parts grid | **none** |
| `husrev_beg_mosque.jpg` | ~52 KB | `mosque.html` hero + home + hub grids | hero/hub done; home grid **none** |
| `raised_relief_map.jpg` | ~7.5 MB | **download link only** on `ottoman/index.html` (a "wallmap"), never an `<img>` | n/a — only fetched if the user clicks it |

Fonts (self-hosted woff2, `@font-face` in `index.css`, `font-display: swap`): `eb-garamond-*-regular` (headings, incl. the above-the-fold `<h1 class="title">`), `oswald-*-300` and `oswald-*-regular` (nav, mast, body). All are discovered only *after* the CSSOM is built, since they're referenced from CSS.

JS: one deferred `type="module"` bundle, no `modulepreload` hint (single entry, so Vite emits none).

Key facts that change priorities:
- The home Parts grid images set no intrinsic `width`/`height`, but `index.css` gives `.page-grid img { width: 100%; aspect-ratio: 16 / 10; object-fit: cover }`, so **CLS is already reserved by CSS** — intrinsic dimensions are a robustness nicety here, not a CLS fix. What's actually missing on that grid is `loading="lazy"` / `decoding="async"`.
- The home Parts grid `alt=""` is plausibly intentional (decorative thumbnails labelled by their `<figcaption>`); confirm against `docs/accessibility.md` before "fixing" it. This differs from the pre-rework state `seo-modernization.md` describes.
- `raised_relief_map.jpg` at 7.5 MB is a click-to-download asset, not a render cost — optimize it opportunistically (low priority), separate from the render path.

## Work items

### 1. Recompress + modern formats (biggest byte win)

The landmark hero JPEGs are the direct cause of the sub-0.9 mobile Lighthouse scores (`bridge` ~0.73, `fountain` ~0.76, `monastery` ~0.84 per `seo-modernization.md`). Two levers, in order of payoff:

- **Recompress the source JPEGs** to sane quality/size (e.g. cap hero dimensions to what the layout actually uses, target quality ~80). `prizren_bridge.jpg` is 2000px wide but displayed at roughly half column width; a 948 KB → sub-200 KB drop is realistic with no visible loss.
- **Serve AVIF/WebP with a JPEG fallback** via `<picture>` (`<source type="image/avif">`, `<source type="image/webp">`, `<img>` JPEG). AVIF/WebP are within the project's `browserslist` floor (Chrome 104 / Firefox 102 / Safari 16.4 all support both), so the JPEG is a true legacy fallback rather than a required path.

### 2. Responsive variants (`<picture>` / `srcset` / `sizes`)

Once formats are sorted, add width-descriptor `srcset` + `sizes` so mobile pulls a small variant rather than the desktop asset. This is the `<picture>`/`srcset` learning item in the WC checklist; the delivery rationale and validation live here. Pair `sizes` with the real rendered widths (landmark hero is a percentage-width float; hub/home grids are 2-up → 1-up under 600px/768px).

### 3. Finish the loading-hint pass on the home Parts grid

`src/index.html` grid images (`gracanica_monastery`, `husrev_beg_mosque`, `croatian_national_theatre`, `national_library_kosovo`) need `loading="lazy"` + `decoding="async"` to match the `ottoman/index.html` hub grid. Add intrinsic `width`/`height` too for robustness even though CSS `aspect-ratio` already reserves space. Confirm whether `alt=""` should stay (decorative) or gain descriptions, per `docs/accessibility.md`. This closes the regression relative to `seo-modernization.md`'s Pillar 5 claim.

### 4. Resource hints (`preload` / `modulepreload`)

- **Preload above-the-fold fonts.** Add `<link rel="preload" as="font" type="font/woff2" crossorigin>` for the fonts painted on first view — `eb-garamond-*-regular` (the `<h1>`) and `oswald-*-regular` (nav/mast), and `oswald-*-300` if the intro copy is above the fold. `crossorigin` is mandatory for font preloads even same-origin, or the fetch is discarded and double-fetched. Preload only the 2–3 truly first-paint faces; over-preloading competes with the LCP image.
- **LCP hero image.** Landmark heroes already carry `fetchpriority="high"`; a `<link rel="preload" as="image">` (with matching `imagesrcset`/`imagesizes` once item 2 lands) can start the fetch even earlier, before the CSS that positions it. Measure before/after — with `fetchpriority` already set, the marginal win may be small.
- **`modulepreload`.** Optionally hint the single component bundle so it fetches in parallel with parsing; minor, since it's deferred and non-blocking already.

Because fonts and heroes are fingerprinted by Vite, hard-coded `preload` hrefs would break on rehash — generate these hints at build time (a small Vite transform / plugin) rather than hand-writing them into each HTML head.

## Relationship to existing docs (what changes)

- `completed/seo-modernization.md` Pillar 5 "Remaining" note: repoint the deferred image-weight work from the WC checklist to **this** doc, and soften the "all `<img>` carry width/height / homepage grid uses `loading="lazy"`" claim to reflect the reworked home Parts grid (tracked as item 3 here).
- `html-webcomponents-mastery-checklist.md` Tier 1 (`<picture>`/`srcset`, `loading`/`decoding`/`fetchpriority`): keep as *feature-learning* items; add a pointer that delivery/performance ownership is here.
- `learning-plan.md` Cycle 4 (WC‑2) can schedule the hands-on `<picture>` practice; the perf acceptance criteria come from this doc's Validation.

## Validation

- `npm run build` succeeds; `npm run lighthouse` mobile scores on `bridge`/`fountain`/`monastery` cross the 0.9 gate (currently warn-only, so track the numbers, don't just rely on pass/fail).
- Confirm AVIF/WebP are actually served to modern browsers and the JPEG fallback to none of the `browserslist` targets (all support the modern formats).
- No double-download from a mismatched font `preload` (check DevTools Network for duplicate font fetches — the classic missing-`crossorigin` symptom).
- CLS stays stable on the home Parts grid after adding hints (it already is, via `aspect-ratio`).
- `npm run a11y` still passes after any `alt` changes on the home grid.

## Open questions

1. **Image tooling vs. the dependency-light ethos.** Options: pre-optimize and commit variants manually (Squoosh, no dependency), or add a build-time step. `sharp` is the obvious generator but a real dependency; a Vite image plugin is another. Decide whether a `postbuild`/Vite step earns its keep or whether committed pre-generated AVIF/WebP/JPEG variants are simpler — mirrors the same "vendored vs build-managed" tension as the Pico decision in `retire-kube-css.md`.
2. **How many font faces to preload**, and whether the body Oswald 300 is genuinely above the fold on the home page (vs. only headings + nav).
3. **`raised_relief_map.jpg` (7.5 MB)** — recompress the downloadable wallmap, or leave it (it's off the render path)? Low priority either way.
4. **Whether to generate the `preload`/`<picture>` markup at build time** (robust against fingerprint rehashing) vs. hand-authoring — item 4 assumes build-time generation.
