import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkLinks, collectExternalLinks, extractPageText, matchToken, meaningfulTokens } from "./check-external-links.mjs";

// Fixture pages for collection; read off disk like the real run. Only the file
// names vary — content is minimal and self-contained.
let srcDir;
let logPath;

beforeEach(() => {
    srcDir = mkdtempSync(join(tmpdir(), "balkans-heritage-linkcheck-"));
    mkdirSync(join(srcDir, "ottoman"), { recursive: true });
    writeFileSync(
        join(srcDir, "index.html"),
        [
            "<!doctype html><html><head>",
            '<link rel="canonical" href="https://balkanheritage.info/">', // ignored: not an <a>
            '<meta property="og:url" content="https://balkanheritage.info/">', // ignored: not an <a>
            "</head><body>",
            '<a href="/ottoman/">internal</a>', // ignored: not external
            '<a href="https://github.com/mgatto/balkans-heritage">GitHub</a>',
            '<a property="license" href="https://creativecommons.org/licenses/by-sa/4.0/">CC-BY-SA 4.0</a>',
            "</body></html>",
        ].join(""),
    );
    writeFileSync(
        join(srcDir, "ottoman", "bridge.html"),
        [
            "<body>",
            '<a href="https://en.wikipedia.org/wiki/Prizren_Fortress">Prizren Fortress</a>',
            '<a href="https://creativecommons.org/licenses/by-sa/4.0/">CC-BY-SA 4.0</a>', // same URL as index.html
            '<span resource="http://www.wikidata.org/entity/Q1"></span>', // ignored: not an <a>
            "</body>",
        ].join(""),
    );
    writeFileSync(
        join(srcDir, "redirect.html"),
        "<body>" + '<a href="http://www.wikidata.org/entity/Q6085799">Wikidata</a>' + "</body>",
    );
    logPath = join(srcDir, "link-check-redirects.log");
});

afterEach(() => {
    rmSync(srcDir, { recursive: true, force: true });
});

// Minimal fetch-mock response: just the surface the script touches (status,
// headers.get, body.getReader for HTML pages). responseLocation emulates a 3xx.
function fakeResponse(bodyText = "", { status = 200, contentType = "text/html", location = null } = {}) {
    const encoded = new TextEncoder().encode(bodyText);
    return {
        status,
        headers: {
            get: (name) => (name === "location" ? location : name === "content-type" ? contentType : null),
        },
        body: {
            getReader() {
                let sent = false;
                return {
                    async read() {
                        if (sent) return { done: true, value: undefined };
                        sent = true;
                        return { done: false, value: encoded };
                    },
                    async cancel() {},
                };
            },
        },
    };
}

const okPage = (title) => fakeResponse(`<!doctype html><title>${title}</title><body>page</body>`);

// Map-driven mock fetch: url → response | array-of-responses (consumed in order).
function mockFetchFor(map) {
    const calls = [];
    const impl = async (url) => {
        calls.push(url);
        const entry = map[url];
        if (Array.isArray(entry)) return entry.shift() ?? entry.slice(-1)[0];
        return entry;
    };
    return { impl, calls };
}

describe("collectExternalLinks", () => {
    it("collects external <a href> only, with anchor text and file", () => {
        const links = collectExternalLinks(["index.html", "ottoman/bridge.html"], srcDir);
        expect(links).toEqual([
            { file: "index.html", url: "https://github.com/mgatto/balkans-heritage", text: "GitHub" },
            { file: "index.html", url: "https://creativecommons.org/licenses/by-sa/4.0/", text: "CC-BY-SA 4.0" },
            { file: "ottoman/bridge.html", url: "https://en.wikipedia.org/wiki/Prizren_Fortress", text: "Prizren Fortress" },
            { file: "ottoman/bridge.html", url: "https://creativecommons.org/licenses/by-sa/4.0/", text: "CC-BY-SA 4.0" },
        ]);
    });
});

describe("extractPageText", () => {
    it("prefers the <title>", () => {
        expect(extractPageText("<title>Hello World</title><body>Other</body>")).toBe("Hello World");
    });

    it("falls back to body text when there's no usable title", () => {
        expect(extractPageText("<title></title><body>Fallback body text</body>")).toBe("Fallback body text");
    });
});

describe("tokenisation", () => {
    it("meaningfulTokens keeps ≥4-letter words", () => {
        expect(meaningfulTokens("the CC-BY-SA 4.0 license")).toEqual(["license"]);
    });

    it("matchToken finds a token case-insensitively", () => {
        expect(matchToken("Prizren Fortress", "Prizren Fortress - Wikipedia")).toBe("prizren");
        expect(matchToken("Prizren Fortress", "Domain for sale")).toBeNull();
    });
});

describe("checkLinks", () => {
    const FILES = ["index.html", "ottoman/bridge.html"];

    it("passes when all links are 2xx with matching content; writes an empty log", async () => {
        const { impl } = mockFetchFor({
            "https://github.com/mgatto/balkans-heritage": okPage("github balkans-heritage repository"),
            "https://creativecommons.org/licenses/by-sa/4.0/": okPage("Creative Commons Attribution-ShareAlike 4.0"),
            "https://en.wikipedia.org/wiki/Prizren_Fortress": okPage("Prizren Fortress"),
        });
        const result = await checkLinks({ files: FILES, fetchImpl: impl, logPath, srcDir, quiet: true });
        expect(result.exitCode).toBe(0);
        expect(result.failures).toBe(0);
        expect(result.redirects).toBe(0);
        expect(readFileSync(logPath, "utf-8")).toBe("");
    });

    it("fails (exit 1) on a non-2xx status", async () => {
        const { impl } = mockFetchFor({
            "https://github.com/mgatto/balkans-heritage": okPage("github balkans-heritage"),
            "https://creativecommons.org/licenses/by-sa/4.0/": okPage("Creative Commons"),
            "https://en.wikipedia.org/wiki/Prizren_Fortress": fakeResponse("", { status: 404 }),
        });
        const result = await checkLinks({ files: FILES, fetchImpl: impl, logPath, srcDir, quiet: true });
        expect(result.exitCode).toBe(1);
        expect(result.failures).toBe(1);
    });

    it("follows a redirect chain and logs the first hop, without failing", async () => {
        const { impl } = mockFetchFor({
            "http://www.wikidata.org/entity/Q6085799": [
                fakeResponse("", { status: 301, location: "https://www.wikidata.org/entity/Q6085799" }),
            ],
            "https://www.wikidata.org/entity/Q6085799": okPage("Wikidata entity"),
        });
        const result = await checkLinks({ files: ["redirect.html"], fetchImpl: impl, logPath, srcDir, quiet: true });
        expect(result.exitCode).toBe(0);
        expect(result.failures).toBe(0);
        expect(result.redirects).toBe(1);
        expect(readFileSync(logPath, "utf-8")).toBe(
            "redirect.html: http://www.wikidata.org/entity/Q6085799 → https://www.wikidata.org/entity/Q6085799 (301)\n",
        );
    });

    it("warns (not fails) when content has no token overlap", async () => {
        const { impl } = mockFetchFor({
            "https://en.wikipedia.org/wiki/Prizren_Fortress": okPage("completely unrelated domain for sale page"),
            "https://creativecommons.org/licenses/by-sa/4.0/": okPage("Creative Commons license"),
        });
        const result = await checkLinks({ files: ["ottoman/bridge.html"], fetchImpl: impl, logPath, srcDir, quiet: true });
        expect(result.exitCode).toBe(0);
        expect(result.warnings).toBeGreaterThan(0);
    });
});
