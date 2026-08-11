import { minify } from 'html-minifier-terser';
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve } from 'path';
import { defineConfig } from 'vite';
import { ViteMinifyPlugin } from 'vite-plugin-minify';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
                main: './index.html', // Main entry point
                bridge: './bridge.html',
                mosque: './mosque.html',
                fountain: './fountain.html',
                monastery: './monastery.html',
                // Footer: './components/FooterComponent/Footer.js',
            },
            /*output: {
                entryFileNames: '[name].js', // This will output files like "button.js" and "card.js"
            },*/
        },
    },
    plugins: [
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
                // Target HTML files that are likely imported as strings for web components
                // Adjust the regex or file extension based on your project's conventions
                if (id.endsWith('.html?inline')) {
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
