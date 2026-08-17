// Captures real-browser screenshots of the site via BrowserStack's Screenshots
// REST API (https://www.browserstack.com/screenshots/api) and downloads the PNGs
// into a gitignored `screenshots/<timestamp>/` folder for manual visual review.
// Real Safari, iOS Safari, Edge, etc. — not an approximation — with no browser
// automation framework: just plain `fetch` plus the lightweight `browserstack-local`
// tunnel binary wrapper (only used by the opt-in `--local` path).
//
// This is a manual, credential-gated command (see README "Cross-browser testing").
// It is deliberately separate from `npm test` and the pre-push hook.
//
// Modes:
//   default        capture the deployed public site (https://balkanheritage.info)
//   --local        vite build + `npm run preview:test` + BrowserStack Local tunnel,
//                  then capture http://bs-local.com:4173 (pre-deploy check of the
//                  local build; `bs-local.com` avoids Safari/iOS localhost redirects)
//   --list         print the account's available browsers/devices (browsers.json)
//                  to help curate .browserstack-browsers.json, then exit
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

const { Local } = browserstackLocal;

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SCREENSHOTS_ENDPOINT = 'https://www.browserstack.com/screenshots';
const BROWSERS_ENDPOINT = 'https://www.browserstack.com/screenshots/browsers.json';

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

// Desktop resolution tiers. The Screenshots API sets screen size per-job via
// win_res/mac_res (applied to Windows / macOS browsers respectively), not per-browser,
// so each tier is a separate job. NOTE: the low-level API historically documents only
// 1024x768 / 1280x1024 for win_res while the UI advertises up to 1920x1080 — if a
// Windows job is rejected for `win_res`, cap the widescreen tier for Windows (macOS
// Safari still covers true 1920x1080). Mobile devices ignore these and render native.
const RESOLUTION_TIERS = [
    { label: 'widescreen', res: '1920x1080' },
    { label: 'normal', res: '1280x1024' },
];

const WAIT_TIME = 5; // seconds BrowserStack waits after load before capturing
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const PREVIEW_STARTUP_TIMEOUT_MS = 30000;

function authHeader(username, accessKey) {
    return `Basic ${Buffer.from(`${username}:${accessKey}`).toString('base64')}`;
}

function isMobile(entry) {
    return Boolean(entry.device || entry.real_mobile);
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

function describe(shot) {
    // Include both browser and device: mobile entries share browser "Mobile Safari",
    // so the device is what distinguishes them (and vice versa for desktop).
    return [shot.os, shot.os_version, shot.browser, shot.device, shot.browser_version]
        .filter(Boolean)
        .join(' ');
}

function fileNameFor(shot, tierLabel) {
    const base = [shot.os, shot.os_version, shot.browser, shot.device, shot.browser_version]
        .filter(Boolean)
        .map(slug)
        .join('-');
    // Desktop tiers get a resolution suffix so widescreen and normal don't collide;
    // mobile is captured once at native resolution, so it needs no suffix.
    const suffix = tierLabel === 'mobile' ? '' : `-${tierLabel}`;
    return `${base}${suffix}.png`;
}

// Builds the list of Screenshots API jobs. Desktop browsers are submitted once per
// resolution tier; mobile devices once (native size, portrait).
function buildJobs({ base, desktop, mobile, isLocal }) {
    const localFlag = isLocal ? { local: 'true' } : {};
    const jobs = [];

    for (const page of PAGES) {
        const url = `${base}${page.path}`;

        if (desktop.length > 0) {
            for (const tier of RESOLUTION_TIERS) {
                jobs.push({
                    page: page.name,
                    tierLabel: tier.label,
                    body: {
                        url,
                        browsers: desktop,
                        win_res: tier.res,
                        mac_res: tier.res,
                        wait_time: WAIT_TIME,
                        quality: 'original',
                        ...localFlag,
                    },
                });
            }
        }

        if (mobile.length > 0) {
            jobs.push({
                page: page.name,
                tierLabel: 'mobile',
                body: {
                    url,
                    browsers: mobile,
                    orientation: 'portrait',
                    wait_time: WAIT_TIME,
                    quality: 'original',
                    ...localFlag,
                },
            });
        }
    }

    return jobs;
}

async function submitJob(auth, job) {
    const res = await fetch(SCREENSHOTS_ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: auth,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(job.body),
    });
    if (!res.ok) {
        throw new Error(
            `Screenshot job submit failed (${res.status}) for ${job.page} [${job.tierLabel}]: ${await res.text()}`,
        );
    }
    const data = await res.json();
    console.log(`Submitted ${job.page} [${job.tierLabel}] -> job ${data.job_id} (${job.body.browsers.length} browser(s))`);
    return data;
}

function isSettled(state) {
    return state === 'done' || state === 'timed-out' || state === 'error';
}

async function pollJob(auth, jobId) {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    for (;;) {
        const res = await fetch(`${SCREENSHOTS_ENDPOINT}/${jobId}.json`, {
            headers: { Authorization: auth, Accept: 'application/json' },
        });
        if (!res.ok) {
            throw new Error(`Polling job ${jobId} failed (${res.status}): ${await res.text()}`);
        }
        const data = await res.json();
        const shots = data.screenshots ?? [];
        const allSettled = shots.length > 0 && shots.every((shot) => isSettled(shot.state));
        if (data.state === 'done' || allSettled) {
            return data;
        }
        if (Date.now() > deadline) {
            throw new Error(`Timed out waiting for job ${jobId} after ${POLL_TIMEOUT_MS / 1000}s.`);
        }
        await sleep(POLL_INTERVAL_MS);
    }
}

// Downloads every done screenshot in a job and returns one record per screenshot
// (including undownloaded/failed ones), used both for the console log and the manifest.
async function downloadJob({ outDir, page, tierLabel, screenshots }) {
    const pageDir = resolve(outDir, page);
    await mkdir(pageDir, { recursive: true });

    const records = [];
    for (const shot of screenshots) {
        const record = {
            browser: describe(shot),
            state: shot.state,
            image_url: shot.image_url ?? null,
            thumb_url: shot.thumb_url ?? null,
            file: null,
        };

        if (shot.state === 'done' && shot.image_url) {
            const filename = fileNameFor(shot, tierLabel);
            const img = await fetch(shot.image_url);
            if (img.ok) {
                await writeFile(resolve(pageDir, filename), Buffer.from(await img.arrayBuffer()));
                record.file = `${page}/${filename}`;
                console.log(`  saved ${page}/${filename}`);
            } else {
                console.warn(`  failed to download ${filename} (${img.status})`);
            }
        } else {
            console.warn(`  skip ${record.browser} [${tierLabel}] — state=${shot.state}`);
        }

        records.push(record);
    }
    return records;
}

// Writes a self-contained record of the run (job IDs, detail URLs, per-screenshot
// states and image URLs) so a run can be re-inspected or re-fetched later without
// scrolling back through console output.
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
    const auth = authHeader(username, accessKey);

    if (isList) {
        await listBrowsers(auth);
        return;
    }

    const matrix = await loadMatrix();
    const desktop = matrix.filter((entry) => !isMobile(entry));
    const mobile = matrix.filter(isMobile);

    const base = isLocal ? LOCAL_BASE : DEPLOYED_BASE;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = resolve(projectRoot, 'screenshots', timestamp);

    console.log(`Target: ${base} (${isLocal ? 'local build via tunnel' : 'deployed site'})`);

    const manifest = {
        generatedAt: new Date().toISOString(),
        target: base,
        mode: isLocal ? 'local' : 'deployed',
        jobs: [],
    };

    let preview;
    let bsLocal;
    try {
        if (isLocal) {
            preview = await startPreview();
            bsLocal = await startTunnel(accessKey);
        }

        for (const job of buildJobs({ base, desktop, mobile, isLocal })) {
            const submitted = await submitJob(auth, job);
            const finished = await pollJob(auth, submitted.job_id);
            const screenshots = await downloadJob({
                outDir,
                page: job.page,
                tierLabel: job.tierLabel,
                screenshots: finished.screenshots ?? [],
            });
            manifest.jobs.push({
                page: job.page,
                tier: job.tierLabel,
                jobId: submitted.job_id,
                url: job.body.url,
                ...(job.tierLabel === 'mobile'
                    ? { orientation: job.body.orientation }
                    : { resolution: job.body.win_res }),
                detailUrl: `${SCREENSHOTS_ENDPOINT}/${submitted.job_id}.json`,
                screenshots,
            });
        }
    } finally {
        if (bsLocal) {
            await stopTunnel(bsLocal);
        }
        if (preview) {
            stopPreview(preview);
        }

        // Write the manifest even on partial failure so a crashed run still leaves a record
        // of the jobs it managed to submit.
        if (manifest.jobs.length > 0) {
            const savedCount = manifest.jobs.reduce(
                (total, job) => total + job.screenshots.filter((shot) => shot.file).length,
                0,
            );
            manifest.screenshotCount = savedCount;
            const manifestPath = await writeManifest(outDir, manifest);
            console.log(`\nCaptured ${savedCount} screenshot(s).`);
            console.log(`Output: ${outDir}`);
            console.log(`Manifest: ${manifestPath}`);
        }
    }
}

main().catch((err) => {
    console.error(err?.message ?? err);
    process.exitCode = 1;
});
