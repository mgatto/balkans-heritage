import { minify } from 'html-minifier-terser';
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve } from 'path';
import { defineConfig } from 'vite';
import { ViteMinifyPlugin } from 'vite-plugin-minify';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    build: {
        outDir: resolve(__dirname, 'dist'), // Places the build folder back at the project root
        emptyOutDir: true, // Forces Vite to empty the dist folder outside the root before building

        /*lib:{
            entry: resolve(__dirname, "components/index.ts"),
            name: 'Footer',
            // format: 'cjs',
            filename: 'Footer.js',

        },*/
        rollupOptions: {
            // https://rollupjs.org/configuration-options/
            input: {
                // Since root is 'src', specify paths relative to the src folder directly
                main: 'index.html',
                bridge: 'bridge.html',
                mosque: 'mosque.html',
                fountain: 'fountain.html',
                monastery: 'monastery.html',
                // Footer: './components/FooterComponent/Footer.js',
            },
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
    ],
})
