import browserslist from 'browserslist';
import browserslistToEsbuild from 'browserslist-to-esbuild';
import { minify } from 'html-minifier-terser';
import { browserslistToTargets } from 'lightningcss';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve } from 'path';
import { defineConfig } from 'vite';
import { ViteMinifyPlugin } from 'vite-plugin-minify';
import { generateSeoFiles } from './scripts/generate-seo-files.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve the `browserslist` key in package.json once (the single source of truth for
// browser support — see docs/completed/lightning-css-adoption.md) and reuse it for both
// the JS build target and the CSS targets, so the two can never drift.
const browsers = browserslist();

// The `version` field is the single source of truth for the site's release —
// see docs/engineering-practices.md for how it's bumped (`npm run release`,
// via Conventional Commits). Reading it here, rather than hardcoding it,
// keeps every build artifact traceable to the release that produced it.
const { version: APP_VERSION } = JSON.parse(
    readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
);

// Canonical production origin, deployed to Cloudflare Workers (Static Assets) — see the
// "Deployment" section in README.md and docs/future/seo-modernization.md. Only the apex
// is a custom domain; `www` 301-redirects to it, so this must stay the apex host.
const SITE_URL = 'https://balkanheritage.info';

// Single source of truth for the site's pages. Drives both `build.rollupOptions.input`
// (name -> file) and the SEO file generator (sitemap.xml / rss.xml), so neither can
// drift from the actual set of pages. Routes are extensionless (`/bridge`, not
// `/bridge.html`) to match the URLs Cloudflare Workers (Static Assets) treats as
// canonical: its `auto-trailing-slash` html_handling serves `bridge.html` at `/bridge`
// (200) and 307-redirects `/bridge.html` → `/bridge`. The source `file` keeps its
// `.html` name (that's the built artifact CF maps to). `title`/`description` feed the RSS
// items. `datePublished` (ISO date) is the feed item's publication date — kept explicit
// here rather than derived from the file's mtime, so editing an existing page doesn't
// re-surface it at the top of the feed. Seeded from each file's first commit; update when
// a page is genuinely (re)published.
const pages = [
    { name: 'main', file: 'index.html', route: '/', title: 'Poetic Tour of the Balkans', description: 'A poetic tour of the Balkans\' layered cultural heritage across the empires and eras that shaped it.', datePublished: '2020-05-25' },
    { name: 'bridge', file: 'bridge.html', route: '/bridge', title: 'The Bridge', description: 'In Prizren, spans a bridge…', datePublished: '2020-05-25' },
    { name: 'mosque', file: 'mosque.html', route: '/mosque', title: 'The Mosque', description: 'From the hills, rises a mosque…', datePublished: '2025-06-06' },
    { name: 'fountain', file: 'fountain.html', route: '/fountain', title: 'The Fountain', description: 'In Sarajevo, flows a fountain…', datePublished: '2020-05-25' },
    { name: 'monastery', file: 'monastery.html', route: '/monastery', title: 'The Monastery', description: 'Beside a monastery, springs the Buna river…', datePublished: '2020-05-25' },
];

const pageInput = Object.fromEntries(pages.map((p) => [p.name, p.file]));

// Vite's core HTML plugin resolves the `href` of every <link> tag as a static asset,
// regardless of its `rel` value. Our pages use <link rel="prev"/"next" href="foo.html">
// for pagination between sibling entry pages, so Vite was fingerprinting those sibling
// HTML files and duplicating them into assets/ (in addition to their real root-level
// entry output). This plugin hides the href on those specific tags before Vite's core
// HTML resolution runs, then restores it once the final HTML has been generated.
const NAV_LINK_ATTR = 'data-vite-skip-href';
const LINK_TAG_RE = /<link\b[^>]*>/gi;

function hidePaginationHrefs(html) {
    return html.replace(LINK_TAG_RE, (tag) => {
        if (/\brel=["'](?:prev|next)["']/i.test(tag) && /\bhref=/i.test(tag)) {
            return tag.replace(/\bhref=/i, `${NAV_LINK_ATTR}=`);
        }
        return tag;
    });
}

function restorePaginationHrefs(html) {
    return html.replaceAll(`${NAV_LINK_ATTR}=`, 'href=');
}

// Vite will automatically copy everything from src/public into the root of your dist folder completely untouched during the build.
export default defineConfig({
    root: resolve(__dirname, 'src'), // Sets the project root to the src folder
    define: {
        // Available to client-side code as a global constant, e.g. for console/debug output.
        __APP_VERSION__: JSON.stringify(APP_VERSION),
    },
    css: {
        // Lightning CSS (Vite's native CSS transformer) both lowers modern syntax and
        // adds browserslist-driven vendor prefixes property-by-property — something
        // esbuild (the default transformer) only does for a small curated set. Sharing
        // the resolved browserslist keeps CSS lowering/prefixing consistent with the JS
        // target. See docs/completed/lightning-css-adoption.md.
        transformer: 'lightningcss',
        lightningcss: { targets: browserslistToTargets(browsers) },
    },
    build: {
        outDir: resolve(__dirname, 'dist'), // Places the build folder back at the project root
        emptyOutDir: true, // Forces Vite to empty the dist folder outside the root before building
        target: browserslistToEsbuild(browsers), // Derives esbuild's JS target from the resolved browserslist
        cssMinify: 'lightningcss', // Minify CSS with the same Lightning CSS targets

        /*lib:{
            entry: resolve(__dirname, "components/index.ts"),
            name: 'Footer',
            // format: 'cjs',
            filename: 'Footer.js',

        },*/
        rollupOptions: {
            // https://rollupjs.org/configuration-options/
            // Since root is 'src', paths are specified relative to the src folder directly
            input: pageInput,
            output: {
                // Safely moves JS files and compiled CSS/image assets into an assets folder
                // Vite automatically exempts primary HTML input entries from these rules
                entryFileNames: 'assets/[name]-[hash].js',
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]',
            }
        },
    },
    plugins: [
        {
            // Stamps every built page with the release version so a deployed
            // `dist/` artifact is traceable back to the `npm run release` that
            // produced it (see docs/engineering-practices.md).
            name: 'inject-generator-meta',
            transformIndexHtml() {
                return [
                    {
                        tag: 'meta',
                        attrs: {
                            name: 'generator',
                            content: `balkans-heritage v${APP_VERSION}`,
                        },
                        injectTo: 'head',
                    },
                ];
            },
        },
        {
            name: 'preserve-pagination-links',
            enforce: 'pre',
            transform(code, id) {
                if (!id.endsWith('.html')) return;
                return hidePaginationHrefs(code);
            },
            transformIndexHtml: {
                order: 'post',
                handler: restorePaginationHrefs,
            },
        },
        // input https://www.npmjs.com/package/html-minifier-terser options
        ViteMinifyPlugin({
            removeComments: true,
            collapseInlineTagWhitespace: true,
            collapseWhitespace: true,
            minifyCSS: true,
            minifyJS: true,
            // removeAttributeQuotes: true,
            // removeEmptyAttributes: true,
            // removeOptionalTags: true,
            removeRedundantAttributes: true,
            // removeScriptTypeAttributes: true,
            // removeStyleLinkTypeAttributes: true,
            sortAttributes: true,
            sortClassName: true,
        }),
        {
            name: 'html-minify-plugin',
            async transform(code, id) {
                // Strict check: Only intercept files explicitly queried with `?inline`
                // This prevents your primary HTML files from turning into hashed JS strings
                if (id.includes('.html?inline')) {
                    const minifiedHtml = await minify(code, {
                        collapseWhitespace: true,
                        removeComments: true,
                        minifyCSS: true,
                        minifyJS: true,
                        // Add other html-minifier-terser options as needed
                    });
                    return `export default ${JSON.stringify(minifiedHtml)}`;
                }
                return code;
            },
        },
        {
            // Generates sitemap.xml, rss.xml, and robots.txt from the `pages` registry
            // (see scripts/generate-seo-files.mjs, which uses the `sitemap` and `feed`
            // libraries), instead of hand-maintaining static copies in src/public/ that
            // drift as pages are added, renamed, or removed. Runs in closeBundle so it
            // fires after Vite's built-in public-dir copy, guaranteeing nothing overwrites
            // the generated files.
            name: 'generate-seo-files',
            apply: 'build',
            async closeBundle() {
                const distDir = resolve(__dirname, 'dist');
                const files = await generateSeoFiles({
                    pages,
                    siteUrl: SITE_URL,
                    srcDir: resolve(__dirname, 'src'),
                });

                for (const [filename, contents] of Object.entries(files)) {
                    writeFileSync(resolve(distDir, filename), contents, 'utf-8');
                }
            },
        },
    ],
})
