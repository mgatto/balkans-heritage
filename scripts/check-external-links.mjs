#!/usr/bin/env node
// External-link checker. Parses every src/*.html file off disk, collects the
// user-facing external link (`<a href="http(s)://…">`) — ignoring machine-only
// URLs like <link rel="canonical">, og:* <meta>, and RDFa `resource` URIs — and
// verifies each one.
//
// Primary (fails the run): the URL resolves (following redirects) to a 2xx
// response. Secondary (warn-only): the fetched page's <title>/leading text has
// some token overlap with the anchor text, catching links that now point at
// squatting/parked pages. Redirects are followed but logged (first hop) to the
// console and to `link-check-redirects.log` at the repo root, so the webmaster
// can update the HTML later; redirects never affect the exit code.
//
// Zero new dependencies: htmlparser2 is already a devDependency (used by
// generate-seo-files.mjs) and Node 24 ships a global fetch.
//
// Source of exit code: 0 on success (or warnings only); 1 if any link fails the
// HTTP check or the script itself errors. Wired as `npm run check:links`, a
// manual command that is deliberately NOT part of lint-staged/pre-push — network
// checks are flaky and would block pushes. See docs/future/external-link-checking.md.

import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Parser } from "htmlparser2";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const SRC_DIR = resolve(REPO_ROOT, "src");

// Gitignored artifact at the repo root (see .gitignore), matching the local.log /
// *.report.html precedent: local-only, regenerated each run.
const REDIRECT_LOG_PATH = resolve(REPO_ROOT, "link-check-redirects.log");

const MAX_HOPS = 10;
const TIMEOUT_MS = 15000;
const CONCURRENCY = 4; // Polite cap, mirroring scripts/browserstack-screenshots.mjs.
const CONTENT_SNIFF_BYTES = 256 * 1024;

// A real-browser UA avoids the bot-403 Wikipedia/CDN domains throw at bare-node
// clients, so the status check isn't a false positive.
const USER_AGENT =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Collection (pure, disk-only).
// ---------------------------------------------------------------------------

// Every external <a href> across the given HTML files, with source location and
// anchor text (the basis for the content-match check). Returns one entry per
// link occurrence (duplicates across pages are kept so the report is complete).
export function collectExternalLinks(files, srcDir = SRC_DIR) {
    const links = [];
    for (const relativeFile of files) {
        const html = readFileSync(resolve(srcDir, relativeFile), "utf-8");
        const stack = []; // in-flight <a> elements with external hrefs
        const parser = new Parser({
            onopentag(name, attributes) {
                const href = attributes.href;
                if (name === "a" && href && /^https?:\/\//i.test(href)) {
                    stack.push({ file: relativeFile, url: href, text: "" });
                }
            },
            ontext(text) {
                if (stack.length > 0) stack[stack.length - 1].text += text;
            },
            onclosetag(name) {
                if (name === "a" && stack.length > 0) {
                    const link = stack.pop();
                    link.text = link.text.trim();
                    links.push(link);
                }
            },
        });
        parser.write(html);
        parser.end();
    }
    return links;
}

// ---------------------------------------------------------------------------
// Content-match (pure).
// ---------------------------------------------------------------------------

// Pull a page's representative text out of the fetched HTML for the overlap
// check: the <title>, then leading body text as a fallback. Whitespace-normalized.
export function extractPageText(html) {
    let title = "";
    let body = "";
    let inTitle = false;
    const parser = new Parser({
        onopentag(name) {
            if (name === "title") inTitle = true;
        },
        ontext(text) {
            if (inTitle) title += text;
            else body += text;
        },
        onclosetag(name) {
            if (name === "title") inTitle = false;
        },
    });
    parser.write(html);
    parser.end();
    const normalize = (s) => s.replace(/\s+/g, " ").trim();
    return normalize(title) || normalize(body);
}

// Meaningful tokens of the anchor text: lowercase, split on non-letters, keep
// words of ≥4 chars (drops stop/yield words like "the"). This is the set a
// squatting page is unlikely to reproduce.
export function meaningfulTokens(text) {
    return text
        .toLowerCase()
        .split(/[^a-zà-öø-ÿ]+/i)
        .filter((token) => token.length >= 4);
}

// Case-insensitive substring overlap of any meaningful token. Returns the first
// matching token, or null when there's no overlap (or no usable tokens).
export function matchToken(anchorText, pageText) {
    const haystack = pageText.toLowerCase();
    for (const token of meaningfulTokens(anchorText)) {
        if (haystack.includes(token)) return token;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Fetch (network): injectable so tests can substitute a mock.
// ---------------------------------------------------------------------------

// Follow one URL hop-by-hop with manual redirect handling, recording the FIRST
// hop for the webmaster log. Returns { finalUrl, status, redirected, firstHop,
// body } or throws on network error after the retry. fetchImpl matches the
// global fetch signature (url, { redirect, signal, headers }).
async function fetchLink(url, fetchImpl) {
    let current = url;
    let firstHop = null;
    const seen = new Set([current]);
    for (let hop = 0; hop < MAX_HOPS; hop++) {
        const response = await fetchWithRetry(current, fetchImpl);
        if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
            const location = new URL(response.headers.get("location"), current).href;
            if (!firstHop) firstHop = { from: current, to: location, status: response.status };
            if (seen.has(location)) break; // redirect loop: stop and report
            seen.add(location);
            current = location;
            continue;
        }
        const body = await sniffBody(response);
        return { finalUrl: current, status: response.status, redirected: current !== url, firstHop, body };
    }
    return { finalUrl: current, status: 0, redirected: current !== url, firstHop, body: null };
}

async function fetchWithRetry(url, fetchImpl) {
    const options = {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,*/*" },
    };
    try {
        return await fetchImpl(url, options);
    } catch {
        // One retry on a network error/timeout (AbortError, DNS, TLS), then rethrow.
        return await fetchImpl(url, options);
    }
}

// Read up to CONTENT_SNIFF_BYTES of the body, then cancel the stream — enough to
// find a <title> without downloading a whole article.
async function sniffBody(response) {
    const contentType = response.headers.get("content-type") || "";
    if (!/^text\/html|application\/xhtml/i.test(contentType)) return { isHtml: false, text: "" };
    try {
        const reader = response.body.getReader();
        const chunks = [];
        let received = 0;
        while (received < CONTENT_SNIFF_BYTES) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
        }
        await reader.cancel().catch(() => {});
        return { isHtml: true, text: new TextDecoder().decode(Buffer.concat(chunks)) };
    } catch {
        return { isHtml: true, text: "" };
    }
}

// Simple windowed concurrency pool, bounded to CONCURRENCY in-flight fetches.
async function pool(items, worker, limit) {
    const results = [];
    let index = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (index < items.length) {
            const item = items[index++];
            results.push(await worker(item));
        }
    });
    await Promise.all(runners);
    return results;
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

export async function checkLinks({ files, fetchImpl = fetch, logPath = REDIRECT_LOG_PATH, srcDir = SRC_DIR, quiet = false } = {}) {
    const targets = files ?? globSync("**/*.html", { cwd: srcDir }).map((f) => f.split(sep).join("/"));
    const links = collectExternalLinks(targets, srcDir);
    const redirectLog = [];
    let failures = 0;
    let warnings = 0;

    // Dedup by URL: fetch once, but report every source page that points at it.
    const byUrl = new Map();
    for (const link of links) {
        if (!byUrl.has(link.url)) byUrl.set(link.url, []);
        byUrl.get(link.url).push(link);
    }

    const emit = (line) => {
        if (!quiet) console.log(line);
    };

    const blocks = await pool(
        [...byUrl.entries()],
        async ([url, occurrences]) => {
            const lines = [`${url}`, `  ← ${occurrences.map((o) => o.file).join(", ")}`];
            let result;
            try {
                result = await fetchLink(url, fetchImpl);
            } catch (error) {
                failures++;
                lines.push(`  ✗ FAIL  fetch error: ${error.message}`);
                return lines;
            }

            // Redirect: log first hop to console + file. Never fails the run.
            if (result.firstHop) {
                const line = `${occurrences.map((o) => o.file).join(", ")}: ${result.firstHop.from} → ${result.firstHop.to} (${result.firstHop.status})`;
                redirectLog.push(line);
                lines.push(`  ⇢ redirect (logged): ${result.firstHop.from} → ${result.firstHop.to}`);
            }

            // Primary: HTTP status.
            if (result.status < 200 || result.status >= 300) {
                failures++;
                lines.push(`  ✗ FAIL  status ${result.status}`);
                return lines;
            }
            lines.push(`  ✓ ${result.status}`);

            // Secondary: content overlap, warn-only.
            const token = matchToken(occurrences[0].text, result.body?.text ?? "");
            if (!result.body?.isHtml || !result.body.text) {
                warnings++;
                lines.push(`  ⚠ content check skipped (non-HTML or unreadable body)`);
            } else if (!token) {
                warnings++;
                lines.push(`  ⚠ WARN  page content doesn't reflect anchor text "${occurrences[0].text}"`);
            }
            return lines;
        },
        CONCURRENCY,
    );

    for (const block of blocks) {
        if (block) emit(`\n${block.join("\n")}`);
    }

    // Write the redirect log (or clear a stale one). Regenerated each run.
    const logContents = redirectLog.length ? `${redirectLog.join("\n")}\n` : "";
    try {
        writeFileSync(logPath, logContents, "utf-8");
    } catch (error) {
        emit(`\ncould not write redirect log ${logPath}: ${error.message}`);
    }

    const unique = byUrl.size;
    emit(
        `\n${unique} external link${unique === 1 ? "" : "s"}: ` +
            `${failures} failed, ${warnings} warning${warnings === 1 ? "" : "s"}, ` +
            `${redirectLog.length} redirect${redirectLog.length === 1 ? "" : "s"} (${relative(REPO_ROOT, logPath)}).`,
    );

    return { failures, warnings, redirects: redirectLog.length, exitCode: failures > 0 ? 1 : 0 };
}

// CLI entrypoint — only when invoked directly, so tests can import the module
// without triggering a real network run.
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
    checkLinks()
        .then(({ exitCode }) => process.exit(exitCode))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
