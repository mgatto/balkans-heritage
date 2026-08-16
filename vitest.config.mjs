import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.js, which sets `root: 'src'` for the
// site build — reusing it here would make Vitest look for tests under src/
// instead of scripts/. Scoped to the pure-Node scripts for now; see
// docs/engineering-practices.md and docs/future/visual-regression-testing.md
// for the rest of the testing story.
export default defineConfig({
    test: {
        include: ['scripts/**/*.test.mjs'],
        environment: 'node',
    },
});
