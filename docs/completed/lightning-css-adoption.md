# Plan: Adopt Lightning CSS for the CSS build pipeline

**Status:** Done — landed 2026-08-18. `lightningcss` added as a devDependency and wired as Vite's `css.transformer` (with `build.cssMinify: 'lightningcss'`), both fed the resolved `browserslist` query that also drives the JS `build.target`. Validated per the checklist below: clean `npm run build` + `npm run preview`, `npm run lint:css` green, and the emitted `dist/` CSS is near-identical at the current floor (only `translate(0,0)` → `translate(0)`, no new prefixing — as predicted). Kept for historical rationale.
**Scope:** `vite.config.js`, `package.json` (devDependencies)
**Related:** [`docs/engineering-practices.md`](../engineering-practices.md), [`docs/future/css-mastery-checklist.md`](../future/css-mastery-checklist.md), [`docs/future/retire-kube-css.md`](../future/retire-kube-css.md); `README.md` ("Minimal dependencies")

## Background

Browserslist is already the single source of truth for this project's browser support, and it *is* respected by the build today — the concern that it is ignored is unfounded. The `browserslist` key in `package.json` (currently Chrome/Edge ≥ 104, Firefox ≥ 102, Safari/iOS ≥ 16.4, `not dead`) feeds two things: the esbuild build target, derived via `browserslistToEsbuild()` (see `target:` at `vite.config.js` line ~76, which governs both JS transpilation and — through Vite's `build.cssTarget` defaulting to `build.target` — CSS syntax lowering), and the lint-time guards `stylelint-no-unsupported-browser-features` (CSS) and `eslint-plugin-compat` (JS APIs), both run on every commit via `lint-staged` (see [`docs/engineering-practices.md`](../engineering-practices.md)).

The one real gap is that esbuild is **not** a full autoprefixer/lowerer. It lowers a limited set of modern CSS syntax and adds only a small, curated set of vendor prefixes based on the target — it does not consult the full caniuse database property-by-property the way Autoprefixer (or Lightning CSS) does. So comprehensive, browserslist-driven prefixing is the piece missing from the build pipeline today.

Two honest qualifications on how much this matters:

- **At the current floor it is essentially a no-op.** At Chrome/Edge 104 (Aug 2022), Firefox 102 (Jun 2022), and Safari/iOS 16.4 (Mar 2023), the CSS this site actually ships (`clamp()`, `aspect-ratio`, `object-fit`, `filter`/`drop-shadow()`, `font-variation-settings`, `clip-path: polygon()`, `shape-outside`) needs no vendor prefixes. The one property that still commonly needs `-webkit-` is `text-size-adjust`, which lives in the Stylelint-ignored `normalize.css`.
- **The payoff is correctness if the floor ever drops, plus tool consolidation.** A single browserslist-aware tool that both lowers and prefixes fits the "Minimal dependencies" design principle better than pulling in the PostCSS + Autoprefixer pair, and it means the pipeline stays correct automatically if the `browserslist` floor is lowered later (e.g. it would then lower `@media` range syntax to `min-width`/`max-width`, which esbuild does not do).

## Chosen approach: Lightning CSS via Vite's built-in support

[Lightning CSS](https://lightningcss.dev/) is Vite's first-party CSS transformer/minifier and reads browser targets from the same `browserslist` query, so it stays consistent with the existing single source of truth. It is one fast, native tool that does both syntax lowering and browserslist-driven vendor prefixing — a better fit for this project's dependency-light ethos than PostCSS + Autoprefixer (the rejected alternative; see Out of scope).

Note that Vite 8 already defaults `build.cssMinify` to `'lightningcss'`, so CSS is *minified* by Lightning CSS today — but the CSS *transformer* still defaults to esbuild, so no targets-based prefixing/lowering happens until `css.transformer` is set to `'lightningcss'` with explicit `targets`.

## Concrete changes

Add `lightningcss` as a devDependency. Keep `browserslist` (already present) and `browserslist-to-esbuild` (still needed for the JS `build.target` — Lightning CSS is CSS-only). Lightning CSS is a native (Rust/napi) binary pulled in as a dev/optional dependency; nothing ships in the runtime bundle.

Then wire the transformer to browserslist in `vite.config.js`, resolving the query once and reusing it for both the JS target and the CSS targets:

```js
import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';

const browsers = browserslist(); // reads the `browserslist` key in package.json

export default defineConfig({
    css: {
        transformer: 'lightningcss',
        lightningcss: { targets: browserslistToTargets(browsers) },
    },
    build: {
        target: browserslistToEsbuild(browsers), // JS transpilation — unchanged role, now shares the resolved list
        cssMinify: 'lightningcss',               // minify with the same targets
        // ...rollupOptions unchanged
    },
});
```

Everything else (`rollupOptions`, the SEO / pagination / HTML-minify plugins) is untouched.

## Caveats (repo-specific)

- **Inline HTML CSS is a separate path.** `ViteMinifyPlugin({ minifyCSS: true })` (html-minifier-terser → clean-css) handles CSS inside `<style>`/style attributes in the HTML; Lightning CSS governs external and imported CSS. Not a conflict, just two tools for two kinds of CSS. The pages link external CSS, so this is a non-issue in practice.
- **`build.target` (JS) stays on `browserslistToEsbuild`.** Lightning CSS does not touch JS — do not remove that dependency.
- **Stricter parsing.** Lightning CSS parses CSS more strictly than esbuild and can error on malformed CSS that previously slid through. The site's CSS is clean and Stylelint-gated, so the risk is low, but it is the most likely source of a first-build surprise — verify a clean `npm run build` + `npm run preview`.
- **Harmless overlap with the Stylelint guard.** `stylelint-no-unsupported-browser-features` still *warns* about below-floor features at authoring time, while Lightning CSS may now silently *fix* some of them at build time. Lint stays the authoring-time signal; Lightning CSS becomes the build-time safety net.

## Interaction with existing plans

The CSS-mastery "Native CSS nesting" item ([`docs/future/css-mastery-checklist.md`](../future/css-mastery-checklist.md), Tier 1) is relevant here: native CSS nesting is supported only from Chrome 112 / Safari 16.5 / Firefox 117, which sits *above* the current browserslist floor (104 / 16.4 / 102). That means whichever CSS transformer is in place — esbuild today, Lightning CSS after this change — is what actually makes authored nesting shippable at the declared floor, rather than the nesting being safe on its own. This is a natural reason to sequence this adoption near the nesting item.

This change is independent of the Kube → Pico migration ([`docs/future/retire-kube-css.md`](../future/retire-kube-css.md)): Pico ships plain CSS, so it neither blocks nor is blocked by adopting Lightning CSS, and the two can land in either order.

## Validation

- `npm run build` and `npm run preview` succeed and every page renders correctly at desktop and < 768px widths (no visual-regression suite yet — do a manual pass).
- `npm run lint:css` stays green.
- Diff the emitted `dist/` CSS before and after the change to confirm near-identical output at the current floor (the expectation is minimal difference today; the value is correctness if the floor is lowered).

## Out of scope / open questions

- **PostCSS + Autoprefixer route** — deliberately rejected in favor of the single built-in Lightning CSS tool; documented here only as the alternative.
- **Hardening the Stylelint gate** — whether to also flip `stylelint-no-unsupported-browser-features` from `severity: "warning"` to `"error"` so below-floor CSS blocks rather than warns. Arguably a stronger guard than any prefixer; decide separately.
- **Lowering the browserslist floor** — this adoption makes a lower floor safer (Lightning CSS would lower more syntax), but the floor itself is intentional (it lines up with `@media` range-query support) and is not changed here.
