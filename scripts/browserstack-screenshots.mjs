// Captures real-browser screenshots of the site via BrowserStack Automate, driven by
// `selenium-webdriver`, and saves the PNGs into a gitignored `screenshots/<timestamp>/`
// folder for manual visual review. Automate exposes the current real browser/device
// grid (modern Chrome, Firefox, Edge, Safari, iOS Safari — not the Screenshots API's
// stale pool), so these are up-to-date real renders, not approximations.
//
// `selenium-webdriver` is a WebDriver client, not a test-runner framework; the only
// other moving part is the lightweight `browserstack-local` tunnel binary wrapper
// (used solely by the opt-in `--local` path). Captures are viewport-only at the two
// resolution tiers below — WebDriver `takeScreenshot()` is viewport-only across every
// real browser/device, which keeps output deterministic without image stitching.
//
// This is a manual, credential-gated command (see README "Cross-browser testing").
// It is deliberately separate from `npm test` and the pre-push hook.
//
// Modes:
//   default        capture the deployed public site (https://balkanheritage.info)
//   --local        vite build + `npm run preview:test` + BrowserStack Local tunnel,
//                  then capture http://bs-local.com:4173 (pre-deploy check of the
//                  local build; `bs-local.com` avoids Safari/iOS localhost redirects)
//   --list         print the account's available Automate browsers/devices
//                  (browsers.json) to help curate .browserstack-browsers.json, then exit
//
// Credentials come from BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY (loaded from
// a gitignored .env via Node's native --env-file-if-exists, or the shell environment).

import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import browserstackLocal from 'browserstack-local';
import webdriver from 'selenium-webdriver';

const { Local } = browserstackLocal;
const { Builder } = webdriver;

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Automate WebDriver grid + the REST catalog used by `--list`.
const HUB_HOST = 'hub-cloud.browserstack.com/wd/hub';
const BROWSERS_ENDPOINT = 'https://api.browserstack.com/automate/browsers.json';
const DASHBOARD_SESSION_BASE = 'https://automate.browserstack.com/dashboard/v2/sessions';

// Canonical deployed origin (matches SITE_URL in vite.config.js).
const DEPLOYED_BASE = 'https://balkanheritage.info';
// `bs-local.com` resolves to the tunnel; using it instead of `localhost` avoids
// Safari desktop / iOS redirecting localhost during Local testing.
const PREVIEW_PORT = 4173;
const LOCAL_BASE = `http://bs-local.com:${PREVIEW_PORT}`;

// Mirrors the `pages` registry routes in vite.config.js. `index` is the home route `/`.
const PAGES = [
    { name: 'index', path: '/' },
    { name: 'bridge', path: '/bridge.html' },
    { name: 'mosque', path: '/mosque.html' },
    { name: 'fountain', path: '/fountain.html' },
    { name: 'monastery', path: '/monastery.html' },
];

// Desktop resolution tiers. Each desktop capture runs in its own session at the tier's
// screen resolution (BrowserStack `resolution` capability) with the browser window
// sized to match, so widescreen and normal are distinct viewport screenshots. Mobile
// devices ignore tiers and render at their native resolution.
const RESOLUTION_TIERS = [
    { label: 'widescreen', res: '1920x1080' },
    { label: 'normal', res: '1280x1024' },
];

const PROJECT_NAME = 'balkans-heritage';
const SETTLE_WAIT_MS = 5000; // pause after load before capturing (late assets/fonts)
const PAGE_LOAD_TIMEOUT_MS = 60000;
const PREVIEW_STARTUP_TIMEOUT_MS = 30000;
// Stay under the OSS program's 5-parallel cap, leaving headroom for the dashboard.
const CONCURRENCY = 4;

function authHeader(username, accessKey) {
    return `Basic ${Buffer.from(`${username}:${accessKey}`).toString('base64')}`;
}

function hubUrl(username, accessKey) {
    return `https://${encodeURIComponent(username)}:${encodeURIComponent(accessKey)}@${HUB_HOST}`;
}

function isMobile(entry) {
    return Boolean(entry.deviceName || entry.realMobile);
}

// Real-mobile entries imply their browser from the device; desktop entries name it
// explicitly. iOS devices run Safari, Android devices run Chrome.
function browserNameFor(entry) {
    if (entry.browserName) {
        return entry.browserName;
    }
    return /iphone|ipad/i.test(entry.deviceName ?? '') ? 'safari' : 'chrome';
}

async function loadMatrix() {
    const file = resolve(projectRoot, '.browserstack-browsers.json');
    const matrix = JSON.parse(await readFile(file, 'utf-8'));
    if (!Array.isArray(matrix) || matrix.length === 0) {
        throw new Error('.browserstack-browsers.json must be a non-empty array of browser objects.');
    }
    return matrix;
}

function slug(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function describe(entry) {
    if (isMobile(entry)) {
        return [entry.deviceName, entry.osVersion, browserNameFor(entry)].filter(Boolean).join(' ');
    }
    return [entry.os, entry.osVersion, entry.browserName, entry.browserVersion].filter(Boolean).join(' ');
}

function fileNameFor(entry, tierLabel) {
    const parts = isMobile(entry)
        ? [entry.deviceName, entry.osVersion, browserNameFor(entry)]
        : [entry.os, entry.osVersion, entry.browserName, entry.browserVersion];
    const base = parts.filter(Boolean).map(slug).join('-');
    // Desktop tiers get a resolution suffix so widescreen and normal don't collide;
    // mobile is captured once at native resolution, so it needs no suffix.
    const suffix = tierLabel === 'mobile' ? '' : `-${tierLabel}`;
    return `${base}${suffix}.png`;
}

// Translates a matrix entry (+ optional desktop tier) into W3C capabilities with the
// BrowserStack-specific settings under `bstack:options`.
function buildCapabilities({ entry, tier, page, isLocal, buildName }) {
    const bstackOptions = {
        projectName: PROJECT_NAME,
        buildName,
        sessionName: `${page.name} · ${describe(entry)}${tier ? ` · ${tier.label}` : ''}`,
        ...(isLocal ? { local: 'true' } : {}),
    };

    const capabilities = { browserName: browserNameFor(entry), 'bstack:options': bstackOptions };

    if (isMobile(entry)) {
        bstackOptions.deviceName = entry.deviceName;
        bstackOptions.osVersion = String(entry.osVersion);
        bstackOptions.realMobile = 'true';
    } else {
        bstackOptions.os = entry.os;
        bstackOptions.osVersion = String(entry.osVersion);
        bstackOptions.resolution = tier.res;
        capabilities.browserVersion = String(entry.browserVersion);
    }

    return capabilities;
}

// Builds the flat list of capture tasks: desktop browsers once per resolution tier,
// mobile devices once (native size, portrait).
function buildTasks({ base, desktop, mobile }) {
    const tasks = [];
    for (const page of PAGES) {
        const url = `${base}${page.path}`;
        for (const entry of desktop) {
            for (const tier of RESOLUTION_TIERS) {
                tasks.push({ page, url, entry, tier, tierLabel: tier.label });
            }
        }
        for (const entry of mobile) {
            tasks.push({ page, url, entry, tier: null, tierLabel: 'mobile' });
        }
    }
    return tasks;
}

async function markSessionStatus(driver, status, reason) {
    try {
        await driver.executeScript(
            `browserstack_executor: ${JSON.stringify({
                action: 'setSessionStatus',
                arguments: { status, reason },
            })}`,
        );
    } catch {
        // Best-effort dashboard annotation; never fail a capture over it.
    }
}

// Opens one Automate session, captures a viewport screenshot, and returns a manifest
// record. Always tears the session down; a failure is recorded, not thrown, so one bad
// browser doesn't abort the whole run.
async function capture({ task, server, outDir, isLocal, buildName }) {
    const { page, url, entry, tier, tierLabel } = task;
    const label = `${page.name} [${describe(entry)}${tier ? ` · ${tier.label}` : ''}]`;
    const record = {
        page: page.name,
        browser: describe(entry),
        tier: tierLabel,
        url,
        ...(isMobile(entry) ? { orientation: 'portrait' } : { resolution: tier.res }),
        sessionId: null,
        dashboardUrl: null,
        file: null,
        status: 'error',
        error: null,
    };

    let driver;
    try {
        driver = await new Builder()
            .usingServer(server)
            .withCapabilities(buildCapabilities({ entry, tier, page, isLocal, buildName }))
            .build();

        const sessionId = (await driver.getSession()).getId();
        record.sessionId = sessionId;
        record.dashboardUrl = `${DASHBOARD_SESSION_BASE}/${sessionId}`;

        await driver.manage().setTimeouts({ pageLoad: PAGE_LOAD_TIMEOUT_MS });
        if (!isMobile(entry)) {
            const [width, height] = tier.res.split('x').map(Number);
            await driver.manage().window().setRect({ x: 0, y: 0, width, height });
        }

        await driver.get(url);
        await sleep(SETTLE_WAIT_MS);

        const base64 = await driver.takeScreenshot();
        const filename = fileNameFor(entry, tierLabel);
        const pageDir = resolve(outDir, page.name);
        await mkdir(pageDir, { recursive: true });
        await writeFile(resolve(pageDir, filename), Buffer.from(base64, 'base64'));

        record.file = `${page.name}/${filename}`;
        record.status = 'done';
        console.log(`  saved ${record.file}`);
        await markSessionStatus(driver, 'passed', `Captured ${record.file}`);
    } catch (err) {
        record.error = err?.message ?? String(err);
        console.warn(`  failed ${label}: ${record.error}`);
        if (driver) {
            await markSessionStatus(driver, 'failed', record.error.slice(0, 255));
        }
    } finally {
        if (driver) {
            try {
                await driver.quit();
            } catch {
                // Session already gone; nothing to clean up.
            }
        }
    }

    return record;
}

// Runs `worker` over `items` with at most `limit` concurrent invocations.
async function runPool(items, limit, worker) {
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const item = items[cursor];
            cursor += 1;
            await worker(item);
        }
    });
    await Promise.all(runners);
}

// Writes a self-contained record of the run (per-capture session IDs, Automate
// dashboard URLs, resolution/orientation, and saved file paths) so a run can be
// re-inspected later without scrolling back through console output.
async function writeManifest(outDir, manifest) {
    await mkdir(outDir, { recursive: true });
    const file = resolve(outDir, 'manifest.json');
    await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
    return file;
}

async function listBrowsers(auth) {
    const res = await fetch(BROWSERS_ENDPOINT, {
        headers: { Authorization: auth, Accept: 'application/json' },
    });
    if (!res.ok) {
        throw new Error(`Fetching browsers.json failed (${res.status}): ${await res.text()}`);
    }
    console.log(JSON.stringify(await res.json(), null, 2));
}

async function waitForPort(port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        try {
            const res = await fetch(`http://localhost:${port}/`, { method: 'HEAD' });
            if (res.status < 500) {
                return;
            }
        } catch {
            // Server not accepting connections yet; keep polling until the deadline.
        }
        if (Date.now() > deadline) {
            throw new Error(`Preview server did not start on :${port} within ${timeoutMs / 1000}s.`);
        }
        await sleep(500);
    }
}

async function startPreview() {
    console.log(`Starting preview server on :${PREVIEW_PORT} (npm run preview:test)...`);
    // `detached` makes the child a process-group leader so teardown can kill the whole
    // group (npm + the vite process it spawns), not just the npm wrapper.
    const child = spawn('npm', ['run', 'preview:test'], {
        cwd: projectRoot,
        detached: true,
        stdio: 'ignore',
    });
    await waitForPort(PREVIEW_PORT, PREVIEW_STARTUP_TIMEOUT_MS);
    console.log('Preview server is up.');
    return child;
}

function stopPreview(child) {
    try {
        process.kill(-child.pid, 'SIGTERM');
    } catch {
        // Process group already gone; nothing to stop.
    }
}

function startTunnel(accessKey) {
    return new Promise((resolvePromise, rejectPromise) => {
        const bsLocal = new Local();
        // No logFile / verbose so the access key can never leak into an artifact.
        bsLocal.start({ key: accessKey, force: true }, (err) => {
            if (err) {
                rejectPromise(err);
                return;
            }
            console.log('BrowserStack Local tunnel started.');
            resolvePromise(bsLocal);
        });
    });
}

function stopTunnel(bsLocal) {
    return new Promise((resolvePromise) => {
        bsLocal.stop(() => {
            console.log('BrowserStack Local tunnel stopped.');
            resolvePromise();
        });
    });
}

async function main() {
    const args = process.argv.slice(2);
    const isLocal = args.includes('--local');
    const isList = args.includes('--list');

    const username = process.env.BROWSERSTACK_USERNAME;
    const accessKey = process.env.BROWSERSTACK_ACCESS_KEY;
    if (!username || !accessKey) {
        console.error(
            'BrowserStack credentials not found. Set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY\n' +
                '(copy .env.example to .env, or export them in your shell). See the README\n' +
                '"Cross-browser testing" section for details.',
        );
        process.exitCode = 1;
        return;
    }

    if (isList) {
        await listBrowsers(authHeader(username, accessKey));
        return;
    }

    const matrix = await loadMatrix();
    const desktop = matrix.filter((entry) => !isMobile(entry));
    const mobile = matrix.filter(isMobile);

    const base = isLocal ? LOCAL_BASE : DEPLOYED_BASE;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = resolve(projectRoot, 'screenshots', timestamp);
    const server = hubUrl(username, accessKey);
    const tasks = buildTasks({ base, desktop, mobile });

    console.log(`Target: ${base} (${isLocal ? 'local build via tunnel' : 'deployed site'})`);
    console.log(`Capturing ${tasks.length} screenshot(s) across ${matrix.length} browser(s), up to ${CONCURRENCY} in parallel...`);

    const manifest = {
        generatedAt: new Date().toISOString(),
        target: base,
        mode: isLocal ? 'local' : 'deployed',
        driver: 'browserstack-automate',
        buildName: timestamp,
        captures: [],
    };

    let preview;
    let bsLocal;
    try {
        if (isLocal) {
            preview = await startPreview();
            bsLocal = await startTunnel(accessKey);
        }

        await runPool(tasks, CONCURRENCY, async (task) => {
            const record = await capture({ task, server, outDir, isLocal, buildName: timestamp });
            manifest.captures.push(record);
        });
    } finally {
        if (bsLocal) {
            await stopTunnel(bsLocal);
        }
        if (preview) {
            stopPreview(preview);
        }

        // Write the manifest even on partial failure so a crashed run still leaves a
        // record of the captures it managed to run.
        if (manifest.captures.length > 0) {
            const savedCount = manifest.captures.filter((item) => item.file).length;
            manifest.screenshotCount = savedCount;
            const manifestPath = await writeManifest(outDir, manifest);
            console.log(`\nCaptured ${savedCount} of ${manifest.captures.length} screenshot(s).`);
            console.log(`Output: ${outDir}`);
            console.log(`Manifest: ${manifestPath}`);
        }
    }
}

main().catch((err) => {
    console.error(err?.message ?? err);
    process.exitCode = 1;
});
