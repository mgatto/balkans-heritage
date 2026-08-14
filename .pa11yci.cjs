// Accessibility conformance checks (WCAG 2.2 AA target — see docs/accessibility.md
// for the known tooling gap between this "standard" option and true 2.2 coverage).
// Mirrors the URL list in lighthouserc.desktop.cjs / lighthouserc.mobile.cjs, but
// served by `vite preview` (see the `a11y` npm script) rather than lhci's own
// static server.
module.exports = {
  defaults: {
    standard: 'WCAG2AA',
    runners: ['axe'],
    timeout: 30000,
    wait: 500,
    // Axe sometimes can't reliably determine contrast where text sits near a
    // floated photo (it flags these as "needs review", not a confirmed
    // failure). Report those as notices rather than errors so real,
    // confirmed violations aren't drowned out; see docs/accessibility.md's
    // manual-testing checklist for what still needs a human look.
    levelCapWhenNeedsReview: 'notice',
    chromeLaunchConfig: {
      args: ['--no-sandbox'],
    },
  },
  urls: [
    'http://localhost:4173/index.html',
    'http://localhost:4173/bridge.html',
    'http://localhost:4173/mosque.html',
    'http://localhost:4173/fountain.html',
    'http://localhost:4173/monastery.html',
  ],
};
