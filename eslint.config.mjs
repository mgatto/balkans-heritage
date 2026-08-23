import compat from "eslint-plugin-compat";
import js from "@eslint/js";
import globals from "globals";
import json from "@eslint/json";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs}"], plugins: { js }, extends: ["js/recommended"] },
  {
    files: ["**/*.{js,mjs,cjs}"],
    // Test files are excluded: they run under Vitest (jsdom), not the shipped bundle, so
    // checking their APIs against the site's browserslist targets would be meaningless.
    ignores: ["scripts/**", "src/components/**/*.test.js", "**/*.config.{js,mjs,cjs}", "**/lighthouserc.*.cjs", "**/.pa11yci.cjs"],
    plugins: { compat },
    languageOptions: {
      // __APP_VERSION__ / __NAV_PAGES__ are injected at build/dev time via Vite's
      // `define` (see vite.config.js), so they're globals to the client code.
      globals: { ...globals.browser, __APP_VERSION__: "readonly", __NAV_PAGES__: "readonly" },
    },
    rules: { "compat/compat": "error" },
  },
  {
    files: ["scripts/**/*.{js,mjs,cjs}", "**/*.config.{js,mjs,cjs}", "**/lighthouserc.*.cjs", "**/.pa11yci.cjs"],
    languageOptions: { globals: globals.node },
  },
  {
    // Component unit tests run in Vitest's jsdom env: browser globals (window, document,
    // customElements, HTMLElement, history…) plus node globals (globalThis, process).
    // describe/it/expect/vi are imported from 'vitest' explicitly, mirroring scripts/.
    files: ["src/components/**/*.test.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  { files: ["**/*.json"], plugins: { json }, language: "json/json", extends: ["json/recommended"] },
  { files: ["**/*.jsonc"], plugins: { json }, language: "json/jsonc", extends: ["json/recommended"] },
  { files: ["**/*.json5"], plugins: { json }, language: "json/json5", extends: ["json/recommended"] },
]);
