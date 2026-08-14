# Accessibility

**Status:** Active practice, not a future plan — see `docs/future/` for work that hasn't started yet.

## Standard

This site targets [WCAG 2.2](https://www.w3.org/TR/WCAG22/) **Level AA**. That's the level referenced by the ADA, Section 508, and EN 301 549, and the de facto baseline for public-facing sites.

## Automated verification

Accessibility conformance is checked automatically as part of `npm run build`, via the `postbuild` hook, using [pa11y-ci](https://github.com/pa11y/ci) with the [axe-core](https://github.com/dequelabs/axe-core) runner against all five built pages (see `.pa11yci.cjs`). Run it on its own with:

```bash
npm run a11y
```

This mirrors the existing Lighthouse CI setup (`lighthouserc.desktop.cjs` / `lighthouserc.mobile.cjs`): it builds on the same pages, runs automatically after a build, and is **warn-only** — violations print to the console but never fail the build or a git hook. Findings are meant to be triaged and fixed as part of normal development, not treated as a hard gate.

## Known tooling gap

pa11y's `standard: 'WCAG2AA'` option currently maps to the axe-core tags `wcag2a`, `wcag21a`, `wcag2aa`, `wcag21aa`, and `best-practice` — it hasn't been updated to include the `wcag22aa` tag, so in practice this setup enforces **WCAG 2.1 AA** automatically ([pa11y/pa11y#666](https://github.com/pa11y/pa11y/issues/666), open upstream). Rather than work around this with a fragile custom rule mapping, the gap is documented here and covered by manual review instead.

Given the site has no authentication, drag interactions, or multi-step forms, the only WCAG 2.2 AA additions that realistically apply are:

- **2.4.11 Focus Not Obscured (Minimum)** — sticky headers/nav shouldn't hide the focused element.
- **2.5.8 Target Size (Minimum)** — interactive targets (links, buttons, checkboxes) should be at least 24×24 CSS pixels, or have sufficient spacing.

## What automated tools can't catch

Automated tools (axe-core included) reliably catch roughly a third of WCAG success criteria — the rest need a human. Before shipping a change that touches markup, interaction, or layout, spot-check:

- **Keyboard-only navigation** — tab through the page; every interactive element should be reachable and show a visible focus indicator, in a sensible order.
- **Screen reader pass** — VoiceOver (macOS/iOS) or NVDA (Windows) on at least the page you changed; confirm headings, landmarks, links, and images make sense out of visual context.
- **Zoom / reflow** — 400% browser zoom (or a narrow viewport) shouldn't lose content or require two-dimensional scrolling.
- **Meaningful alt text** — every `<img>` either describes its content/purpose or is genuinely decorative (`alt=""`), never a placeholder.
- **Reading order** — the DOM order should match the visual reading order, especially where CSS repositions content.

## Configuration reference

- `.pa11yci.cjs` — pa11y-ci config: standard, runner, and the list of built pages.
- `preview:test`, `pa11y:run`, `a11y` npm scripts in `package.json` — see comments there for how the static server is started for the scan.
