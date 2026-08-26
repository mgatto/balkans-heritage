import browserslist from 'browserslist';
import browserslistToEsbuild from 'browserslist-to-esbuild';
import { minify } from 'html-minifier-terser';
import { browserslistToTargets } from 'lightningcss';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
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
// "Deployment" section in README.md and docs/completed/seo-modernization.md. Only the apex
// is a custom domain; `www` 301-redirects to it, so this must stay the apex host.
const SITE_URL = 'https://balkanheritage.info';

// Controlled vocabulary (docs/future/information-architecture.md, goal 5): a small, fixed,
// build-enforced set of allowed `part`/`country` values, so a typo fails the build rather
// than silently drifting into an inconsistent spelling/casing (the "folksonomy" failure
// mode). This array is the single *enforced* source of the allowed values — docs describe
// the membership criteria, not the literal list, to avoid a second source that could drift.
const PARTS = ['byzantine', 'ottoman', 'habsburg', 'socialist'];
const COUNTRIES = ['balkans', 'kosovo', 'bosnia'];

// Single source of truth for the site's pages. Drives `build.rollupOptions.input`
// (name -> file), the SEO file generator (sitemap.xml / rss.xml), and the registry-driven
// nav/pagination/breadcrumb generator (see the `inject-registry-nav` plugin below), so none
// of them can drift from the actual set of pages.
//
// Routes are nested and extensionless (`/ottoman/bridge`, not `/bridge.html`) to match the
// URLs Cloudflare Workers (Static Assets) treats as canonical: its `auto-trailing-slash`
// html_handling serves `ottoman/bridge.html` at `/ottoman/bridge` (200) and 307-redirects
// `/ottoman/bridge.html` → `/ottoman/bridge`. The source `file` keeps its `.html` name and
// directory (that's the built artifact CF maps to). Old flat URLs 301 to these via
// src/public/_redirects.
//
// Array order is the tour reading order, and is load-bearing: the generator derives each
// page's prev/next pagination from its position here. `title`/`description` feed the RSS
// items and the generated breadcrumbs; `navLabel` is the (concise) global-nav label;
// `part`/`country` are the controlled-vocabulary facts (grouping, breadcrumbs, country
// facet). `datePublished` (ISO date) is the feed item's publication date — kept explicit
// here rather than derived from the file's mtime, so editing an existing page doesn't
// re-surface it at the top of the feed. Seeded from each file's first commit; update when
// a page is genuinely (re)published.
//
// `nav: false` marks a *utility* page (e.g. About): kept out of the global tour nav bar
// AND out of the prev/next tour pagination, while still being a real built page in the
// sitemap/feed/llms.txt. It is distinct from the *derived* nav exclusion of landmark pages
// (which are in the tour but not in the top-level bar) — see the `__NAV_PAGES__` and
// `inject-registry-nav` logic below.
const pages = [
    { name: 'main', file: 'index.html', route: '/', navLabel: 'Home', title: 'Poetic Tour of the Balkans', description: 'A poetic tour of the Balkans\' layered cultural heritage across the empires and eras that shaped it.', datePublished: '2020-05-25' },
    { name: 'ottoman', file: 'ottoman/index.html', route: '/ottoman/', part: 'ottoman', navLabel: 'Ottoman', title: 'The Ottoman Heritage', description: 'Part II of the Poetic Tour of the Balkans — the region\'s Ottoman-era heritage.', datePublished: '2020-05-25' },
    { name: 'fountain', file: 'ottoman/fountain.html', route: '/ottoman/fountain', part: 'ottoman', country: 'bosnia', navLabel: 'Fountain', title: 'The Fountain', description: 'In Sarajevo, flows a fountain…', datePublished: '2020-05-25' },
    { name: 'mosque', file: 'ottoman/mosque.html', route: '/ottoman/mosque', part: 'ottoman', country: 'bosnia', navLabel: 'Mosque', title: 'The Mosque', description: 'From the hills, rises a mosque…', datePublished: '2025-06-06' },
    { name: 'monastery', file: 'ottoman/monastery.html', route: '/ottoman/monastery', part: 'ottoman', country: 'bosnia', navLabel: 'Monastery', title: 'The Monastery', description: 'Beside a monastery, springs the Buna river…', datePublished: '2020-05-25' },
    { name: 'bridge', file: 'ottoman/bridge.html', route: '/ottoman/bridge', part: 'ottoman', country: 'kosovo', navLabel: 'Bridge', title: 'The Bridge', description: 'In Prizren, spans a bridge…', datePublished: '2020-05-25' },
    { name: 'about', file: 'about.html', route: '/about', nav: false, navLabel: 'About', title: 'About', description: 'About Balkan Heritage and its maker — the cosmopolitan intent behind the tour and the craft behind the code.', datePublished: '2026-08-22' },
];

// Fail the build loudly on an out-of-vocabulary `part`/`country` (controlled vocabulary,
// not folksonomy — see PARTS/COUNTRIES above and information-architecture.md goal 5).
for (const p of pages) {
    if (p.part && !PARTS.includes(p.part)) {
        throw new Error(`vite.config.js: unknown part "${p.part}" on page "${p.name}" (allowed: ${PARTS.join(', ')})`);
    }
    if (p.country && !COUNTRIES.includes(p.country)) {
        throw new Error(`vite.config.js: unknown country "${p.country}" on page "${p.name}" (allowed: ${COUNTRIES.join(', ')})`);
    }
}

const pageInput = Object.fromEntries(pages.map((p) => [p.name, p.file]));

// --- Registry-driven nav / pagination / breadcrumb / facet generation ------------------
// One generator, keyed off the `pages` registry, replaces what used to be hand-maintained
// in three places (Navigation.js's <ol>, each page's <link rel="prev"/"next">, and — new —
// breadcrumbs + the country facet). See information-architecture.md goals 3, 4, and 6.

const escapeHtml = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// `Home > The Ottoman Heritage > The Bridge` as BreadcrumbList RDFa. The trail is derived
// purely from the page's `part` (its hub is the registry entry whose `name === part`), so
// home gets a 1-level trail, the hub a 2-level one, and landmarks a 3-level one, with no
// per-page configuration.
function buildBreadcrumb(page) {
    const home = pages.find((p) => p.route === '/');
    const hub = page.part ? pages.find((p) => p.name === page.part) : null;

    const crumbs = [];
    if (page === home) {
        crumbs.push({ name: 'Home' });
    } else {
        crumbs.push({ name: 'Home', href: '/' });
        if (hub && hub !== page) crumbs.push({ name: hub.title, href: hub.route });
        crumbs.push({ name: page.title });
    }

    const items = crumbs
        .map((c, i) => {
            const isCurrent = i === crumbs.length - 1;
            const label = `<span property="name">${escapeHtml(c.name)}</span>`;
            const inner = isCurrent ? label : `<a property="item" href="${c.href}">${label}</a>`;
            const current = isCurrent ? ' aria-current="page"' : '';
            return `<li property="itemListElement" typeof="ListItem"${current}>${inner}<meta property="position" content="${i + 1}"></li>`;
        })
        .join('');

    return `<nav aria-label="Breadcrumb" class="breadcrumbs" typeof="BreadcrumbList"><ol>${items}</ol></nav>`;
}

// "More in Bosnia" — Location kept as a cross-referencing facet, not a rival hierarchy
// (information-architecture.md goal 6). Only rendered when at least one *other* page shares
// the current page's `country`.
function buildCountryFacet(page) {
    if (!page.country) return '';
    const related = pages.filter((p) => p.country === page.country && p !== page);
    if (related.length === 0) return '';

    const label = titleCase(page.country);
    const links = related.map((p) => `<li><a href="${p.route}">${escapeHtml(p.title)}</a></li>`).join('');
    return `<aside class="country-facet" aria-label="More in ${escapeHtml(label)}"><p>More in ${escapeHtml(label)}:</p><ul>${links}</ul></aside>`;
}

// Vite will automatically copy everything from src/public into the root of your dist folder completely untouched during the build.
export default defineConfig({
    root: resolve(__dirname, 'src'), // Sets the project root to the src folder
    define: {
        // Available to client-side code as global constants.
        // __APP_VERSION__: release version, e.g. for console/debug output.
        __APP_VERSION__: JSON.stringify(APP_VERSION),
        // __NAV_PAGES__: the registry, trimmed to what the global nav needs, so
        // Navigation.js renders its <ol> from the same single source of truth as
        // pagination/breadcrumbs/SEO instead of a hand-maintained hardcoded list.
        // The global bar is section-level: only Home and each Part hub appear in it.
        // `nav` marks those top-level entries (Home has no `part`; a Part hub is the
        // entry whose `name === part` — the same hub convention the breadcrumb generator
        // uses), so landmark pages (part set, name !== part) fall out automatically and
        // are instead reached via the hub grid, breadcrumbs, and prev/next pagination.
        // `part` is kept so the client can highlight the active *section* while on a
        // landmark page.
        __NAV_PAGES__: JSON.stringify(
            pages.map((p) => ({
                name: p.name,
                route: p.route,
                navLabel: p.navLabel,
                title: p.title,
                part: p.part ?? null,
                // A page is in the global tour nav bar when it's a top-level/hub page
                // (no `part`, or it *is* its part's hub), UNLESS it explicitly opts out
                // with `nav: false` (utility pages like About).
                nav: p.nav !== false && (!p.part || p.name === p.part),
            }))
        ),
    },
    css: {
        // Lightning CSS (Vite's native CSS transformer) both lowers modern syntax and
        // adds browserslist-driven vendor prefixes property-by-property — something
        // esbuild (the default transformer) only does for a small curated set. Sharing
        // the resolved browserslist keeps CSS lowering/prefixing consistent with the JS
        // target. See docs/completed/lightning-css-adoption.md.
        transformer: 'lightningcss',
        lightningcss: { targets: browserslistToTargets(browsers) },
        // Pico is compiled from its vendored SCSS (src/assets/css/pico.scss) so we can
        // trim it to the modules this site uses. Pico's package.json declares no
        // `exports`/`sass` entry, so resolve its source via a node_modules load path
        // rather than a `pkg:` specifier. Sass runs before Lightning CSS transforms.
        preprocessorOptions: {
            scss: { loadPaths: ['node_modules'] },
        },
    },
    build: {
        outDir: resolve(__dirname, 'dist'), // Places the build folder back at the project root
        emptyOutDir: true, // Forces Vite to empty the dist folder outside the root before building
        target: browserslistToEsbuild(browsers), // Derives esbuild's JS target from the resolved browserslist
        cssMinify: 'lightningcss', // Minify CSS with the same Lightning CSS targets

        rollupOptions: {
            // https://rollupjs.org/configuration-options/
            // Since root is 'src', paths are specified relative to the src folder directly.
            // Nested entries (e.g. 'ottoman/bridge.html') build to the matching nested path
            // in dist (dist/ottoman/bridge.html).
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
            // Registry-driven generator: injects each page's prev/next pagination links,
            // its BreadcrumbList breadcrumbs, and (on landmark pages) the country facet,
            // all derived from the `pages` array above. Replaces the old hand-maintained
            // pagination <link>s and the `preserve-pagination-links` workaround they needed.
            name: 'inject-registry-nav',
            transformIndexHtml(html, ctx) {
                const currentFile = relative(resolve(__dirname, 'src'), ctx.filename).split(sep).join('/');
                const index = pages.findIndex((p) => p.file === currentFile);
                if (index === -1) return html;
                const page = pages[index];

                const tags = [];
                // prev/next describe the guided tour sequence, so they walk the tour
                // pages only — utility pages (`nav: false`, e.g. About) are excluded, so
                // they neither emit a spurious prev/next nor pull a tour page's `next`
                // onto themselves (which appending About to the registry otherwise would).
                const tour = pages.filter((p) => p.nav !== false);
                const tourIndex = tour.indexOf(page);
                if (tourIndex !== -1) {
                    const prev = tour[tourIndex - 1];
                    const next = tour[tourIndex + 1];
                    if (prev) tags.push({ tag: 'link', attrs: { rel: 'prev', href: prev.route }, injectTo: 'head' });
                    if (next) tags.push({ tag: 'link', attrs: { rel: 'next', href: next.route }, injectTo: 'head' });
                }

                // Breadcrumbs go in as the first child of <main>; the country facet is
                // appended inside the landmark <article>. Both are string-injected because
                // the tag-descriptor API can only target <head>/<body>, not arbitrary nodes.
                let out = html.replace(/(<main\b[^>]*>)/, `$1${buildBreadcrumb(page)}`);
                const facet = buildCountryFacet(page);
                if (facet) out = out.replace('</article>', `${facet}</article>`);

                return { html: out, tags };
            },
        },
        {
            // Injects resource hints (preload) with build-resolved, fingerprinted
            // URLs. Fonts are hashed via CSS processing and images via asset hashing,
            // so hand-written hrefs would break on every rehash — this reads the
            // emitted bundle instead. Runs in the `post` phase so `ctx.bundle` (the
            // hashed asset list) is populated. See docs/future/asset-loading-optimization.md
            // item 4. No-op on the dev server (no bundle), where assets are unhashed.
            name: 'inject-resource-hints',
            transformIndexHtml: {
                order: 'post',
                handler(html, ctx) {
                    const bundle = ctx.bundle;
                    if (!bundle) return html;

                    const assets = Object.values(bundle).filter((a) => a.type === 'asset');
                    // Every original basename an emitted asset was derived from, so we
                    // can match on the pre-hash filename regardless of Rollup's field.
                    const basenames = (a) =>
                        [a.name, a.originalFileName, ...(a.originalFileNames || [])]
                            .filter(Boolean)
                            .map((n) => n.split('/').pop());

                    const tags = [];

                    // 1. Above-the-fold woff2 faces: the <h1> (EB Garamond regular) and
                    //    the nav/mast (Oswald regular). These are discovered only after
                    //    the CSSOM is built (referenced from CSS), so preloading them
                    //    starts the fetch earlier. `crossorigin` is mandatory on font
                    //    preloads even same-origin, or the fetch is discarded and the
                    //    font double-fetches. Kept to two faces so the hints don't
                    //    compete with the LCP hero image.
                    const aboveFoldFonts = [
                        'eb-garamond-v33-latin_latin-ext-regular.woff2',
                        'oswald-v57-latin_latin-ext-regular.woff2',
                    ];
                    for (const face of aboveFoldFonts) {
                        const asset = assets.find((a) => basenames(a).includes(face));
                        if (asset) {
                            tags.push({
                                tag: 'link',
                                attrs: {
                                    rel: 'preload',
                                    as: 'font',
                                    type: 'font/woff2',
                                    href: '/' + asset.fileName,
                                    crossorigin: 'anonymous',
                                },
                                injectTo: 'head',
                            });
                        }
                    }

                    // 2. LCP hero preload on landmark pages, typed image/avif so browsers
                    //    without AVIF skip it and fall through the <picture> normally (no
                    //    double-download); AVIF browsers fetch exactly the file the hero's
                    //    own <source> would pick. imagesizes mirrors the hero `sizes`.
                    const heroBaseByPage = {
                        bridge: 'prizren_bridge',
                        fountain: 'fountain2',
                        mosque: 'husrev_beg_mosque',
                        monastery: 'blagaj_tekke',
                    };
                    const currentFile = relative(resolve(__dirname, 'src'), ctx.filename).split(sep).join('/');
                    const page = pages.find((p) => p.file === currentFile);
                    const heroBase = page && heroBaseByPage[page.name];
                    if (heroBase) {
                        const avifRe = new RegExp(`^${heroBase}-(\\d+)\\.avif$`);
                        const variants = assets
                            .map((a) => {
                                const match = basenames(a).map((n) => n.match(avifRe)).find(Boolean);
                                return match ? { width: Number(match[1]), fileName: a.fileName } : null;
                            })
                            .filter(Boolean)
                            .sort((a, b) => a.width - b.width);
                        if (variants.length) {
                            tags.push({
                                tag: 'link',
                                attrs: {
                                    rel: 'preload',
                                    as: 'image',
                                    type: 'image/avif',
                                    href: '/' + variants[variants.length - 1].fileName,
                                    imagesrcset: variants.map((v) => `/${v.fileName} ${v.width}w`).join(', '),
                                    imagesizes: '(max-width: 768px) 90vw, (max-width: 1200px) 48vw, 560px',
                                    fetchpriority: 'high',
                                },
                                injectTo: 'head',
                            });
                        }
                    }

                    return { html, tags };
                },
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
