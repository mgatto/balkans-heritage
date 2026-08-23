import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.js, which sets `root: 'src'` for the
// site build — reusing it here would make Vitest resolve paths against src/.
// Two Vitest projects share this file:
//   - `scripts`  — pure-Node build scripts (scripts/**/*.test.mjs), node env.
//   - `components` — the framework-free Web Components (src/components/**/*.test.js),
//     jsdom env, so customElements/attachShadow/shadowRoot are available.
// See docs/engineering-practices.md and docs/future/visual-regression-testing.md
// for how these unit tests relate to the separate real-browser/VRT track.

// Replicates vite.config.js's html-minify-plugin for `.html?inline` imports (Vite has
// no native `?inline` handling for HTML). Tests only need the raw string, so unlike the
// build plugin this skips minification.
const htmlInline = {
    name: 'html-inline-test',
    transform(code, id) {
        if (id.includes('.html?inline')) {
            return `export default ${JSON.stringify(code)}`;
        }
    },
};

export default defineConfig({
    test: {
        coverage: {
            // Enabled so `npm test` (and thus the pre-push hook) always collects coverage
            // and enforces the thresholds below — Vitest does NOT collect by default, so
            // without this the thresholds would silently never run.
            enabled: true,
            provider: 'v8',
            include: ['src/components/**/*.js'],
            exclude: ['src/components/**/*.test.js'],
            reporter: ['text', 'html'],
            thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
        },
        projects: [
            {
                test: {
                    name: 'scripts',
                    environment: 'node',
                    include: ['scripts/**/*.test.mjs'],
                },
            },
            {
                plugins: [htmlInline],
                // __NAV_PAGES__ is a Vite build-time `define` in the app (see vite.config.js);
                // here we point it at a global so each test can set/vary the registry
                // (including the empty-registry edge case) via globalThis.__NAV_PAGES__.
                define: { __NAV_PAGES__: 'globalThis.__NAV_PAGES__' },
                test: {
                    name: 'components',
                    environment: 'jsdom',
                    include: ['src/components/**/*.test.js'],
                },
            },
        ],
    },
});
