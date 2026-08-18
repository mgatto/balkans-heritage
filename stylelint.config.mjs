/** @type {import('stylelint').Config} */
export default {
    extends: ["stylelint-config-standard"],
    plugins: ["stylelint-no-unsupported-browser-features"],
    rules: {
        // clip-path/masks are marked "partial" by caniuse even in current Safari (it
        // wants -webkit- for some SVG cases), but the basic-shape polygon() usage here
        // works unprefixed at our browserslist floor -- so ignore those two false
        // positives and let the warn-only gate flag genuinely out-of-target features.
        "plugin/no-unsupported-browser-features": [
            true,
            { severity: "warning", ignore: ["css-clip-path", "css-masks"] },
        ],
    },
    "ignoreFiles": [
        "src/assets/css/kube.css",
        "src/assets/css/normalize.css",
        "dist/**/*"
    ],
};
