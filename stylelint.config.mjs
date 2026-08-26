/** @type {import('stylelint').Config} */
export default {
  extends: ["stylelint-config-standard"],
  plugins: ["stylelint-no-unsupported-browser-features"],
    rules: {
        // Prefer the bare-string @import form (`@import '…'`) over the url() function
        // form. Both are equally valid CSS, but stylelint-config-standard defaults this
        // to 'url'; we override to 'string' as the house style. Keep index.css's Pico
        // import in sync with this value.
        "import-notation": "string",

        // clip-path/masks are marked "partial" by caniuse even in current Safari (it
    // wants -webkit- for some SVG cases), but the basic-shape polygon() usage here
    // works unprefixed at our browserslist floor -- so ignore those two false
    // positives and let the warn-only gate flag genuinely out-of-target features.
    "plugin/no-unsupported-browser-features": [
      true,
      { severity: "warning", ignore: ["css-clip-path", "css-masks"] },
    ],
  },
  ignoreFiles: ["dist/**/*"],
};
