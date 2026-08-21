// Accessibility conformance scan (WCAG 2.2 AA target — see docs/accessibility.md).
//
// Replaces the previous pa11y-ci setup. pa11y's `standard: 'WCAG2AA'` maps to a hardcoded,
// stale list of axe-core tags that never had `wcag22aa` added (pa11y/pa11y#666), so it
// silently only enforced WCAG 2.1 AA. Driving axe-core directly through Puppeteer lets us
// name the exact tag set ourselves — including `wcag22aa` — so the automated check finally
// matches the site's stated 2.2 AA target instead of quietly lagging a version behind.
//
// Run via `npm run a11y` (which builds + serves a preview first via start-server-and-test),
// or against an already-running preview with `node scripts/a11y.mjs`. Point it elsewhere
// with A11Y_BASE_URL.
//
// Warn-only by default (mirrors the old `pa11y:run || true`): findings print but the
// process exits 0, so a build/postbuild never fails on them. Pass `--strict` to exit 1 on
// any confirmed violation — the switch a future CI gate can flip once CI exists (the
// outstanding gap in docs/engineering-practices.md).

import { AxePuppeteer } from '@axe-core/puppeteer';
import puppeteer from 'puppeteer';

const BASE = process.env.A11Y_BASE_URL ?? 'http://localhost:4173';

// Mirrors the `pages` registry routes in vite.config.js, kept in sync by hand the same way
// scripts/browserstack-screenshots.mjs and the Lighthouse CI configs do. Served as built
// `.html` files by `vite preview`. (A shared routes module imported by all of them would
// remove the duplication, but that's a separate refactor touching vite.config.js.)
const ROUTES = [
    '/index.html',
    '/ottoman/index.html',
    '/ottoman/bridge.html',
    '/ottoman/mosque.html',
    '/ottoman/fountain.html',
    '/ottoman/monastery.html',
];

// The exact axe-core tags to run — controlling this list is the whole reason for dropping
// pa11y. `wcag2a`..`wcag21aa` reproduce what pa11y's `WCAG2AA` already covered; `wcag22aa`
// is the addition pa11y couldn't reach (its automated 2.2 rule today is `target-size`,
// i.e. SC 2.5.8 Target Size (Minimum) — SC 2.4.11 Focus Not Obscured still has no axe rule
// and stays on the manual checklist in docs/accessibility.md). `best-practice` keeps the
// extra non-WCAG axe rules pa11y also ran. Trim or extend to taste.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const PAGE_LOAD_TIMEOUT_MS = 30000;

const strict = process.argv.includes('--strict');

// axe splits findings into `violations` (confirmed failures) and `incomplete` ("needs
// review" — axe couldn't decide, e.g. text contrast over a floated photo). We surface the
// former as errors and the latter as notices. This replaces pa11y's
// `levelCapWhenNeedsReview: 'notice'`, and is cleaner: axe already separates the two rather
// than us reclassifying a capped result after the fact. See docs/accessibility.md's manual
// checklist for what a human still needs to confirm.
function printFindings(findings) {
    for (const rule of findings) {
        console.log(`   [${rule.impact ?? 'n/a'}] ${rule.id}: ${rule.help}`);
        console.log(`      ${rule.helpUrl}`);
        for (const node of rule.nodes) {
            const target = node.target?.join(', ') ?? '(unknown target)';
            console.log(`      - ${target}`);
            if (node.failureSummary) {
                for (const line of node.failureSummary.split('\n')) {
                    console.log(`          ${line}`);
                }
            }
        }
    }
}

async function main() {
    const browser = await puppeteer.launch({
        // `--no-sandbox` mirrors the old .pa11yci.cjs chromeLaunchConfig; required in many
        // CI containers where Chrome's own sandbox can't run.
        args: ['--no-sandbox'],
    });

    let totalViolations = 0;
    let totalNotices = 0;

    try {
        for (const route of ROUTES) {
            const url = `${BASE}${route}`;
            const page = await browser.newPage();
            try {
                await page.goto(url, { waitUntil: 'networkidle0', timeout: PAGE_LOAD_TIMEOUT_MS });
                const { violations, incomplete } = await new AxePuppeteer(page).withTags(TAGS).analyze();

                totalViolations += violations.length;
                totalNotices += incomplete.length;

                console.log(`\n${url}`);
                if (violations.length === 0 && incomplete.length === 0) {
                    console.log('   no violations, nothing needs review');
                }
                if (violations.length > 0) {
                    console.log(`   ${violations.length} violation(s):`);
                    printFindings(violations);
                }
                if (incomplete.length > 0) {
                    console.log(`   ${incomplete.length} item(s) needing manual review (notice):`);
                    printFindings(incomplete);
                }
            } finally {
                await page.close();
            }
        }
    } finally {
        await browser.close();
    }

    console.log(
        `\nDone — ${totalViolations} violation(s), ${totalNotices} item(s) needing review across ${ROUTES.length} page(s).`,
    );

    if (strict && totalViolations > 0) {
        console.error(`\n--strict: failing on ${totalViolations} confirmed violation(s).`);
        process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error(err?.message ?? err);
    process.exitCode = 1;
});
