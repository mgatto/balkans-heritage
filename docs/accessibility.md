# Accessibility

**Status:** Active practice, not a future plan — see `docs/future/` for work that hasn't started yet.

## Standard

This site targets [WCAG 2.2](https://www.w3.org/TR/WCAG22/) **Level AA**. That's the level referenced by the ADA, Section 508, and EN 301 549, and the de facto baseline for public-facing sites.

## Automated verification

Accessibility conformance is checked automatically as part of `npm run build`, via the `postbuild` hook, using [axe-core](https://github.com/dequelabs/axe-core) driven through Puppeteer by `scripts/a11y.mjs` against all six built pages. Run it on its own with:

```bash
npm run a11y
```

This mirrors the existing Lighthouse CI setup (`lighthouserc.desktop.cjs` / `lighthouserc.mobile.cjs`): it builds on the same pages, runs automatically after a build, and is **warn-only** — findings print to the console but never fail the build or a git hook. Findings are meant to be triaged and fixed as part of normal development, not treated as a hard gate. (For a future CI gate, `node scripts/a11y.mjs --strict` exits non-zero on any confirmed violation.)

## Why a custom axe-core runner instead of pa11y

This previously used [pa11y-ci](https://github.com/pa11y/ci), whose `standard: 'WCAG2AA'` option maps to a **hardcoded, stale** list of axe-core tags (`wcag2a`, `wcag21a`, `wcag2aa`, `wcag21aa`, `best-practice`) that was never updated to include `wcag22aa` ([pa11y/pa11y#666](https://github.com/pa11y/pa11y/issues/666), open upstream) — so it silently enforced only **WCAG 2.1 AA** despite the 2.2 AA target above. The axe-core engine itself has had the `wcag22aa` tag for several releases; only pa11y's translation layer lagged.

`scripts/a11y.mjs` calls axe-core directly and names the tag set explicitly (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, `best-practice`), so the automated check tracks the 2.2 AA target instead of a version behind it, with no upstream dependency to wait on. axe splits results into confirmed `violations` (reported as errors) and `incomplete` / "needs review" items (reported as notices) — the latter replaces pa11y's old `levelCapWhenNeedsReview: 'notice'` softening for things like text contrast over a floated photo.

## What's still on the manual checklist

Automated coverage of WCAG 2.2's *new* criteria is partial, so these still need a human. Given the site has no authentication, drag interactions, or multi-step forms, the 2.2 AA additions that realistically apply are:

- **2.5.8 Target Size (Minimum)** — interactive targets (links, buttons, checkboxes) should be at least 24×24 CSS pixels, or have sufficient spacing. *Now checked automatically* via axe-core's `target-size` rule (tagged `wcag22aa`).
- **2.4.11 Focus Not Obscured (Minimum)** — sticky headers/nav shouldn't hide the focused element. **No axe-core rule exists for this**, so it remains a manual check.

## What automated tools can't catch

Automated tools (axe-core included) reliably catch roughly a third of WCAG success criteria — the rest need a human. Before shipping a change that touches markup, interaction, or layout, spot-check:

- **Keyboard-only navigation** — tab through the page; every interactive element should be reachable and show a visible focus indicator, in a sensible order.
- **Screen reader pass** — VoiceOver (macOS/iOS) or NVDA (Windows) on at least the page you changed; confirm headings, landmarks, links, and images make sense out of visual context.
- **Zoom / reflow** — 400% browser zoom (or a narrow viewport) shouldn't lose content or require two-dimensional scrolling.
- **Meaningful alt text** — every `<img>` either describes its content/purpose or is genuinely decorative (`alt=""`), never a placeholder.
- **Reading order** — the DOM order should match the visual reading order, especially where CSS repositions content.

## Configuration reference

- `scripts/a11y.mjs` — the axe-core/Puppeteer scan: the explicit tag set, the page list, and the violations-vs-needs-review handling, all with inline comments.
- `preview:test`, `a11y:scan`, `a11y` npm scripts in `package.json` — how the static preview server is started for the scan (`a11y` = server + scan; `a11y:scan` = scan only, against an already-running preview).
