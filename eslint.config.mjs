import compat from "eslint-plugin-compat";
import js from "@eslint/js";
import globals from "globals";
import json from "@eslint/json";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs}"], plugins: { js }, extends: ["js/recommended"] },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ignores: ["scripts/**", "**/*.config.{js,mjs,cjs}", "**/lighthouserc.*.cjs", "**/.pa11yci.cjs"],
    plugins: { compat },
    languageOptions: { globals: globals.browser },
    rules: { "compat/compat": "error" },
  },
  {
    files: ["scripts/**/*.{js,mjs,cjs}", "**/*.config.{js,mjs,cjs}", "**/lighthouserc.*.cjs", "**/.pa11yci.cjs"],
    languageOptions: { globals: globals.node },
  },
  { files: ["**/*.json"], plugins: { json }, language: "json/json", extends: ["json/recommended"] },
  { files: ["**/*.jsonc"], plugins: { json }, language: "json/jsonc", extends: ["json/recommended"] },
  { files: ["**/*.json5"], plugins: { json }, language: "json/json5", extends: ["json/recommended"] },
]);
