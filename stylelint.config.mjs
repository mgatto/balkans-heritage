/** @type {import('stylelint').Config} */
export default {
    extends: ["stylelint-config-standard"],
    "ignoreFiles": [
        "src/assets/css/kube.css",
        "src/assets/css/normalize.css",
        "dist/**/*"
    ],
};
