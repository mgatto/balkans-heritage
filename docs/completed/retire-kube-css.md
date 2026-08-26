# Plan: Retire kube.css in favor of Pico.css

**Status:** Done — landed August 2026. The vendored `src/assets/css/kube.css` was removed and Pico.css adopted as the classless base, with a thin hand-written `.row`/`.col` Flexbox grid replacing Kube's (Pico ships no 12-column grid) and all 7 pages pinned to `data-theme="light"`. Subsequently refined into a module-trimmed Pico build compiled from source (`src/assets/css/pico.scss` + `sass`, replacing the prebuilt `pico.classless.min.css`) — see [`docs/future/design-system-tokens.md`](../future/design-system-tokens.md) "Pico's weight (and trimming it)". Kept for historical rationale.
**Scope:** `src/assets/css/` (`index.css`, `pico.scss`), `src/*.html`, `vite.config.js`, `package.json`
**Related:** README section "Design principles"; `AGENTS.md` ("No front-end framework"); [`docs/future/design-system-tokens.md`](../future/design-system-tokens.md); [`docs/future/dark-mode.md`](../future/dark-mode.md)

## Background

The site vendors [Kube](https://github.com/imperavi/kube) **6.5.2** (dated February 2, 2017) as a static `src/assets/css/kube.css` — a ~40 KB, 2156-line file linked from all five pages (`index`, `bridge`, `mosque`, `fountain`, `monastery`). The upstream project was **archived in June 2022** and is no longer maintained. Only the CSS is used; Kube's JavaScript is not referenced anywhere, and Kube is *not* an npm dependency (it is a checked-in file).

Because it is a vendored, non-executing stylesheet, "archived" carries **no security or supply-chain risk** and there is no urgency. The motivation to remove it is alignment with the project's stated ethos — *minimal dependencies, standards-first, progressive enhancement* — not a defect. The site leans on only a small subset of Kube. The chosen path is to **replace Kube with [Pico.css](https://picocss.com/)** — a tiny, actively maintained, MIT-licensed, dependency-free CSS framework that styles semantic HTML with (mostly) no classes — plus a thin layer of hand-written CSS for the few layout helpers Pico does not provide.

This migration also **collapses three overlapping reset layers** into Pico's single base: today every page loads `normalize.css`, Kube's own resets (inside `kube.css`), *and* a Meyer reset embedded at the top of `index.css` — all competing over the same properties. Adopting Pico's base as the sole reset (step 2 below) is therefore not just a Kube swap; it retires the whole redundant reset stack. This is the reason the standalone "collapse the triple reset/normalize layer" idea in [`optimization-opportunities.md`](./optimization-opportunities.md) is folded into this plan rather than tracked separately.

## Chosen replacement: Pico.css

[Pico.css](https://picocss.com/) (v2, MIT) is the selected replacement. Rationale and fit:

- **Still dependency-light and framework-free in spirit.** Pico is a single CSS file with **no JavaScript** and no required build step. It is far smaller than Kube (~10 KB min+gzip for the classless build vs. Kube's 40 KB raw) and pulls in no component/runtime layer, so it stays within the project's "keep the codebase dependency-light" rule. Note that `AGENTS.md`'s "No front-end framework" line targets JS frameworks (React/Vue/etc.); a classless CSS baseline is compatible in spirit — the wording will be updated as part of this work (see step 9 in "Suggested approach").
- **Classless / semantic-first.** Pico styles native elements (`<button>`, `<input>`, `<form>`, `<article>`, headings, tables…) directly, which matches the project's standards-first, progressive-enhancement ethos. Most of the form and button styling the site currently gets from Kube classes comes "for free" from semantic markup, letting us **delete** those classes rather than re-port them.
- **Actively maintained**, unlike archived Kube; regular releases and modern browser support.
- **Maps cleanly onto current usage:** Pico styles the site's form controls and submit buttons natively from semantic markup, so most of what the site currently gets from Kube form/button classes comes "for free" and those classes can be deleted rather than re-ported.

What Pico does **not** provide, and therefore still needs a little custom CSS:

- **A 12-column grid.** Pico ships a simple auto `.grid` (equal-width columns) and `.container`, but not Kube's fixed `col-8`/`col-10` widths. The header centering and asymmetric column widths need the small custom rules below. (Note: the auto `.grid`/`.container` helpers are class-based and therefore absent from the classless build we selected — see "Selected variant" — so this grid work is hand-written regardless.)
- **Multi-column running text** (`.columns-2`) — native CSS `column-count` covers this.
- **Button variants (`.secondary`/`.contrast`/`.outline`).** These are class-based and **not included in the classless build**. The site has no `.secondary` button in its current markup (the only button, `#maps-download` in `src/ottoman/index.html`, is already custom-styled in `index.css`), so this costs nothing today; if a dark/secondary button variant is ever wanted, add a small custom rule rather than relying on a Pico class.

### Selected variant

**Decision: use the classless build** (`pico.classless.min.css`) — this resolves open question #2. It fits the project's standards-first, progressive-enhancement ethos most directly (style semantic HTML, write no framework classes) and keeps the CSS payload smallest. The trade-off — no `.container`/`.grid`/`.secondary`/`.outline` helpers — is a non-issue here: the site already needs a hand-written layout layer for its `col-8`/`col-10` grid (below), and has no button variants in use.

Sub-variant to confirm during implementation: the **default** classless build centers `<header>`/`<main>`/`<footer>` (as direct children of `<body>`) as max-width containers, whereas `pico.fluid.classless.min.css` leaves them full-width. Prefer the **default (centered)** build since the site already caps content width, but verify Pico's auto-container on `<main>` against the existing `#bridge/#fountain/#mosque/#monastery main { max-width: 70rem }` rules so the two width caps don't fight.

**Install method: npm `@picocss/pico`** (resolved — see open question 1). npm is preferred over a vendored copy: `dist/` output is identical either way, but npm gives explicit version pinning in `package.json`/lockfile and easy upgrades (`npm install @picocss/pico@latest`), avoiding the silent-stale pattern that motivated retiring Kube. Import via `@import '@picocss/pico/css/pico.classless.min.css';` at the top of `index.css` — Vite resolves node_modules CSS imports natively (no `~` prefix needed), and IDE tooling follows the import for `--pico-*` variable completions.

## Current state (audit)

Every page loads three stylesheets (order varies slightly per page): `normalize.css`, `kube.css`, `index.css`. The complete set of Kube classes the markup depends on, and how each is handled after moving to Pico:

| Kube class | Where used | What Kube does | Under Pico |
| --- | --- | --- | --- |
| `.row` | header + main section on every page | `display: flex; flex-wrap: wrap;` (column below 768px) | keep as thin custom rule (Pico has no equivalent) |
| `.align-center` | `header.row align-center` | `justify-content: center` | keep (custom) |
| `.around` | `section.row ... around` | `justify-content: space-around` | keep (custom) |
| `.gutters` | `section.row gutters around` | 2% negative margin + 2% child margin; `calc(width - 2%)` | keep, simplified to `gap` (custom) |
| `.col` | grid children | flex child; full width below 768px | keep (custom) |
| `.col-8` | header inner `div` | `width: 66.66667%` | keep (custom) |
| `.col-10` | main `article` | `width: 83.33333%` | keep (custom) |
| `.title` | `h1.title` | large heading (60px/64px) — `index.css` also sets `.title { margin-top: 0.5em }` | Pico styles `h1`; keep `.title` only for size/spacing overrides |
| `.text-center` | `h1.title text-center` | `text-align: center` | keep (custom, trivial) |
| `.columns-2` | body copy on `bridge`, `fountain`, `mosque` | `column-count: 2; column-gap: 24px` | keep (custom, native CSS) |
| `.form-inline` | ~~`index.html` contact form~~ | inline-block inputs, `width: auto` | **already absent** — contact form removed from `index.html`; no action needed |
| `.form-item` | ~~`index.html` labels~~ | `margin-bottom: 2rem` | **already absent** |
| `.label` | ~~`index.html` labels~~ | **badge/pill styling** (grey background) | **already absent** |
| `.checkbox` | ~~`index.html` labels~~ | checkbox label sizing + `cursor: pointer` | **already absent** |
| `.button` | ~~`index.html` submit~~ | base button (blue background, padding, radius) | **already absent** |
| `.secondary` | ~~`index.html` submit~~ | dark-grey button variant (`#313439`) | **already absent** — and not in the classless build anyway |

Responsive behavior Kube provided (and Pico does not, for the custom grid): at `max-width: 768px`, stack `.row` vertically, set each `.col` to `width: 100%`, drop gutters. Reproduce this in the custom layer below.

### ~~Quirk to resolve first~~ Already resolved

~~On `index.html` the form uses `<label class="label form-item">`.~~ The contact form has been removed from `index.html`; `.label`, `.form-item`, and all other Kube form classes are already absent from the markup. No action needed here.

## Custom CSS to keep on top of Pico

Pico handles resets, typography, forms, and buttons. The only rules that must be hand-written are the layout helpers Kube provided that Pico lacks. Add these to `index.css` (or a small dedicated `layout.css`), loaded **after** Pico:

```css
/* --- Layout: row / col (Kube grid replacement; Pico has no 12-col grid) --- */
.row {
  display: flex;
  flex-wrap: wrap;
}
.row.align-center { justify-content: center; }
.row.around { justify-content: space-around; }

/* Gutters via gap instead of Kube's negative margins */
.row.gutters { gap: 16px 2%; }

.col { flex: 0 1 auto; }
.col-8  { flex-basis: 66.6667%; }
.col-10 { flex-basis: 83.3333%; }

/* Kube subtracts the 2% gutter from each column's width */
.row.gutters > .col-8  { flex-basis: calc(66.6667% - 2%); }
.row.gutters > .col-10 { flex-basis: calc(83.3333% - 2%); }

@media (max-width: 768px) {
  .row { flex-direction: column; flex-wrap: nowrap; }
  .row > .col,
  .row > .col-8,
  .row > .col-10 { flex-basis: 100%; }
}

/* --- Typography helper --- */
.text-center { text-align: center; }

/* --- Multi-column body copy --- */
.columns-2 {
  column-count: 2;
  column-gap: 24px;
}

/* .title: Pico styles h1; keep only overrides that differ from Pico's defaults
   (the existing index.css `.title { margin-top: 0.5em }` can stay). */
```

Deliberately **not** ported, because Pico covers them natively:

- `.button`, `.form-item`, `.checkbox`, `.label`, `.secondary` — already absent from the markup (contact form removed from `index.html`); no porting needed.
- Global reset / `box-sizing` — Pico includes its own base, so this no longer needs hand-porting (see reset reconciliation below).

## Preserving typography & look-and-feel

Keeping the site's visual identity (EB Garamond headings, Oswald body, `#333` on white, the per-page hero shapes) is both possible and cheap. The goal is a **hybrid**: let Pico own the reset and the form/field/button styling, but keep the project's typographic character. Adopt Pico's *component* styling; do not surrender the *type* identity.

Why it's efficient — two mechanisms:

1. **The identity already lives in `index.css`, not in Kube.** The `@import` of EB Garamond + Oswald, the `h1..h6 { font-family: 'EB Garamond' !important }` rule, `.intro`, `figcaption`, the hero `clip-path`/`shape-outside` shapes, and `.attribution` are all independent of Kube and survive the swap untouched.

   **Subtlety — re-home the base type declarations.** There is *no* standalone `html { font-family: 'Oswald'; color: #333 }` rule to lean on: the base `font-family: Oswald`, `color: #333`, and `font-variation-settings: 'wdth' 115` are declared **inside the Meyer reset's universal selector block** (`index.css` lines ~127-130, applied to the whole `html, body, div, … audio, video` list) — the very block step 2 deletes. So removing the Meyer reset also removes the site's base font, color, and width axis. Re-home them when reconciling the reset: set `--pico-font-family: 'Oswald'` and `--pico-color: #333` at `:root` (Pico then inherits them site-wide), and note that **`font-variation-settings: 'wdth' 115` has no Pico equivalent** — re-declare it explicitly (e.g. on `html`/`body`) or the semi-condensed Oswald width is silently lost.
2. **Pico is built to be overridden.** Pico applies its base typography with **zero-specificity `:where()` selectors** — e.g. `:where(:host),:where(:root){ font-family:var(--pico-font-family); color:var(--pico-color); background-color:var(--pico-background-color); … }`. Because `:where(:root)` has specificity `(0,0,0)`, the existing `html { … }` rules in `index.css` (specificity `(0,0,1)`) win automatically, with no `!important` needed. For headings, Pico sets `h1..h6 { font-family:var(--pico-font-family) }` at the same specificity as `index.css`, but `index.css` loads after Pico *and* uses `!important`, so EB Garamond wins regardless.

On top of the cascade advantage, Pico v2 exposes **~149 `--pico-*` CSS custom properties**, so its own components (form fields, buttons, links) are rethemed by setting a few variables at `:root` rather than fighting selectors:

```css
:root {
  --pico-font-family: 'Oswald', sans-serif;   /* Pico's forms/buttons inherit Oswald */
  --pico-font-weight: 300;                      /* thin body copy, applied uniformly (see below) */
  --pico-color: #333;
  --pico-primary: /* site accent for links/buttons */;
  --pico-border-radius: 3px;                    /* keeps the old Kube button feel if wanted */
}
```

**Body-copy weight: retire the `p`-only thinness quirk.** Today the site's thin body text is a happy accident, not a clean rule. The Meyer reset forces `font-weight: normal` (400) on every element, and only `p` is overridden with `font-weight: lighter` in `src/assets/css/index.css`. Because `lighter` is a *relative* keyword, it resolves against the inherited 400 to a computed 100, which the font-matcher then rounds up to the only lighter Oswald face that exists — 300. The upshot: `<p>` renders at Oswald 300 while every other text element (`<li>`, `<td>`, `<dd>`, `<blockquote>`, …) stays at 400 and reads heavier. That gap is exactly why the About page's craft list needed an explicit `#about ul li { font-weight: lighter }` patch. Since this migration removes the Meyer reset anyway (step 2 below), take the opportunity to make the thin weight a deliberate, uniform setting instead of a per-element chase: set it once via `--pico-font-weight: 300` (shown above) — or a single `body { font-weight: 300 }` rule — applied to all body text. Then delete the `p { font-weight: lighter }` rule and the `#about ul li` (and any similar) per-element weight patches, which become redundant. Headings are unaffected: they use EB Garamond via the `h1..h6 { font-family: 'EB Garamond' !important }` rule and their own weight.

Re-declare the one thing currently supplied by **Kube** (not `index.css`): the large hero title. `index.css` only sets `.title { margin-top: 0.5em }`; the `60px/64px` size came from Kube's `h1.title`. To keep the big title under Pico:

```css
.title { font-size: 3.75rem; line-height: 1.067; }
```

**Dark-mode pin (important).** Pico ships an automatic color scheme driven by `prefers-color-scheme`. The page background stays white (the `html` rule out-specifies Pico's `:where(:root)`), but Pico's dark-mode *form fields and buttons* would still render dark on a white page — a mismatch. Force light mode by adding `data-theme="light"` to `<html>` on each page (or override the relevant `--pico-*` color variables). This is the single most likely visual surprise when adopting Pico.

## Suggested approach

1. **Add Pico** via npm (`npm install @picocss/pico`). Add `@import '@picocss/pico/css/pico.classless.min.css';` as the first line of `index.css` — CSS `@import` must precede all other rules, and Vite resolves node_modules imports natively.
2. **Reconcile resets.** Pico ships its own normalize-style base and sets `box-sizing: border-box` globally. **Delete `normalize.css`** — it is fully superseded by Pico's base (verified: Pico covers `box-sizing`, `text-size-adjust`, `sub`/`sup`, `abbr`, `small`, `b`/`strong`, `fieldset`/`legend`, `[type=search]`, `textarea`, `::-moz-focus-inner`, form-control font inheritance, and more). **Remove the Meyer reset** imported at the top of `index.css`: its `line-height: 1`, `list-style: none`, and margin-zeroing directly conflict with Pico's opinionated base and would strip both Pico's and the site's intended spacing. Keep only the project-specific rules further down in `index.css`. This is the highest-risk step visually — verify carefully.
3. **Remove the Kube link** (`<link rel="stylesheet" href="assets/css/kube.css">`) from all five pages and delete `src/assets/css/kube.css`.
4. **Verify Kube class cleanup.** All form-specific Kube classes (`.button`, `.form-item`, `.label`, `.checkbox`, `.secondary`) are already absent — the contact form has been removed from `index.html`. No stripping needed; just confirm with a quick search that none remain. Keep the layout classes (`row`, `col`, `col-8`, `col-10`, `gutters`, `around`, `align-center`, `columns-2`, `text-center`).
5. **Add the custom layout layer** above to `index.css` (or `layout.css`), plus the typography/theme rules from "Preserving typography & look-and-feel" (the few `--pico-*` variables and the `.title` size). While here, set the body weight globally (`--pico-font-weight: 300`) and **remove** the old `p { font-weight: lighter }` rule and the `#about ul li` per-element weight patch — see "Body-copy weight" above.
6. **Pin light mode** by adding `data-theme="light"` to `<html>` on all five pages, so Pico's auto dark mode doesn't render dark form fields/buttons on the white page.
7. Work **incrementally, page by page**, comparing before/after in the browser, since there is no visual regression suite.
8. **Update docs wording:** in `AGENTS.md` and README, clarify that a classless CSS baseline (Pico) is permitted while JS front-end frameworks (React/Vue/etc.) remain disallowed.

## Validation

- `npm run lint:html` stays green (watch for any attributes/classes removed).
- `npm run lint:css` (Stylelint) passes on the custom layer.
- `npm run build` succeeds and `npm run preview` renders each page correctly at desktop and <768px widths.
- Confirm Pico's base does not conflict with (or duplicate) the remaining reset once `normalize.css` and the Meyer reset are removed.
- Verify the site's fonts/colors still win over Pico (EB Garamond headings, Oswald body, `#333` on white) and that the `.title` size is preserved.
- Confirm body-copy weight is now uniform (Oswald 300) across `p`, `li`, `td`, etc. — no element reads heavier than the surrounding prose — and that the old `p { font-weight: lighter }` rule and the `#about ul li` weight patch have been removed.
- Check that `data-theme="light"` is applied so no component renders in dark mode on the white page.
- Manual visual diff of: header centering, the two-column body copy (`bridge`/`fountain`/`mosque`), and the download button form in `ottoman/index.html`.

## Out of scope

- Adopting a **heavier** framework (Bootstrap, Tailwind, etc.) — rejected as counter to the project's minimal-dependency ethos; Pico was chosen precisely because it is tiny and classless.
- Redesigning page layout or visual style beyond what adopting Pico's defaults naturally changes.
- A broad refactor of `index.css` typography beyond reconciling it with Pico's base.

## Open questions

1. ~~**Pico install method:** npm `@picocss/pico` (build-managed) vs. a vendored copy under `src/assets/css/` (matches how Kube is stored today) vs. CDN `<link>`.~~ **Resolved: npm `@picocss/pico`.** `dist/` output is identical either way; npm wins on explicit version pinning (`package.json`/lockfile), easy upgrades (`npm install @picocss/pico@latest`), and avoids repeating the silent-stale vendored-file pattern that motivated retiring Kube. IDE tooling follows the `@import` into `node_modules` for `--pico-*` completions. See step 1 in "Suggested approach".
2. ~~**Pico variant:** classless build vs. the class-based (`.container`) build.~~ **Resolved: classless build** — see "Selected variant" above. (The theming approach itself — keep the site's type identity, override a few `--pico-*` variables, pin light mode — is settled in "Preserving typography & look-and-feel".) One sub-choice remains for implementation time: default (centered-container) classless vs. `fluid.classless`; the default is preferred (see "Selected variant").
3. ~~**`form-inline`:** accept Pico's default stacked form, or keep an inline layout via a small custom rule?~~ **Moot** — the contact form has been removed from `index.html`; no form-inline decision needed.
4. ~~**Docs wording:** update `AGENTS.md` / README to clarify that a classless CSS baseline (Pico) is permitted while JS front-end frameworks remain disallowed.~~ **Not a decision — converted to action item** (step 8 in "Suggested approach").
