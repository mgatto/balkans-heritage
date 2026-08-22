import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateSeoFiles } from './generate-seo-files.mjs';

const SITE_URL = 'https://example.test';

const PAGES = [
    { name: 'main', file: 'index.html', route: '/', title: 'Home', description: 'Home page', datePublished: '2020-01-01' },
    { name: 'about', file: 'about.html', route: '/about', title: 'About', description: 'About this site', datePublished: '2020-01-02' },
    { name: 'ottoman', file: 'ottoman/index.html', route: '/ottoman/', part: 'ottoman', title: 'The Ottoman Heritage', description: 'Ottoman hub', datePublished: '2020-01-03' },
    { name: 'bridge', file: 'bridge.html', route: '/bridge', part: 'ottoman', title: 'The Bridge', description: 'A bridge', datePublished: '2020-01-04' },
];

// Rich <meta name="description"> content per fixture file. `bridge.html` is
// deliberately omitted so its llms.txt entry exercises the fallback to the
// registry's short description.
const RICH_DESCRIPTIONS = {
    'index.html': 'Rich home meta description.',
    'about.html': 'Rich about meta description.',
    'ottoman/index.html': 'Rich Ottoman hub meta description.',
};

// generateSeoFiles() reads real files off disk (mtimes for the sitemap's lastmod,
// and each page's <meta name="description"> for llms.txt), so each test gets a
// throwaway srcDir with just enough fixture HTML to satisfy that — rather than
// depending on the real src/*.html files, which would make tests brittle to
// unrelated content changes. The meta description is written line-wrapped to mirror
// the real pages and prove the parser handles multi-line attributes.
let srcDir;

beforeEach(() => {
    srcDir = mkdtempSync(join(tmpdir(), 'balkans-heritage-seo-'));
    for (const page of PAGES) {
        const full = join(srcDir, page.file);
        mkdirSync(dirname(full), { recursive: true });
        const rich = RICH_DESCRIPTIONS[page.file];
        const meta = rich ? `\n    <meta name="description"\n        content="${rich}">` : '';
        writeFileSync(full, `<!doctype html><html><head><title>fixture</title>${meta}</head><body></body></html>`);
    }
});

afterEach(() => {
    rmSync(srcDir, { recursive: true, force: true });
});

function urlBlocks(sitemapXml) {
    return [...sitemapXml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
}

function extractTag(block, tag) {
    return block.match(new RegExp(`<${tag}>(.*?)<\\/${tag}>`))?.[1];
}

describe('generateSeoFiles', () => {
    it('returns exactly llms.txt, sitemap.xml, rss.xml, and robots.txt', async () => {
        const files = await generateSeoFiles({ pages: PAGES, siteUrl: SITE_URL, srcDir });
        expect(Object.keys(files).sort()).toEqual(['llms.txt', 'robots.txt', 'rss.xml', 'sitemap.xml']);
    });

    it('gives the home route top priority and every other route a notch below', async () => {
        const { 'sitemap.xml': sitemapXml } = await generateSeoFiles({ pages: PAGES, siteUrl: SITE_URL, srcDir });
        const blocks = urlBlocks(sitemapXml);

        const home = blocks.find((b) => extractTag(b, 'loc') === `${SITE_URL}/`);
        const bridge = blocks.find((b) => extractTag(b, 'loc') === `${SITE_URL}/bridge`);

        expect(extractTag(home, 'priority')).toBe('1.0');
        expect(extractTag(bridge, 'priority')).toBe('0.8');
    });

    it('includes one rss item per page with the right title, link, and description', async () => {
        const { 'rss.xml': rssXml } = await generateSeoFiles({ pages: PAGES, siteUrl: SITE_URL, srcDir });

        expect(rssXml.match(/<item>/g)).toHaveLength(PAGES.length);
        expect(rssXml).toContain('The Bridge'); // titles are wrapped in <![CDATA[...]]> by the `feed` library
        expect(rssXml).toContain(`<link>${SITE_URL}/bridge</link>`);
        expect(rssXml).toContain('A bridge');
    });

    it('points robots.txt at the sitemap and allows crawling', async () => {
        const { 'robots.txt': robotsTxt } = await generateSeoFiles({ pages: PAGES, siteUrl: SITE_URL, srcDir });

        expect(robotsTxt).toContain('User-agent: *');
        expect(robotsTxt).toContain('Allow: /');
        expect(robotsTxt).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
    });

    it('welcomes known AI crawlers in robots.txt with explicit Allow rules', async () => {
        const { 'robots.txt': robotsTxt } = await generateSeoFiles({ pages: PAGES, siteUrl: SITE_URL, srcDir });

        for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot']) {
            expect(robotsTxt).toContain(`User-agent: ${bot}`);
        }
        // Every explicit crawler block allows crawling.
        expect(robotsTxt.match(/Allow: \//g).length).toBeGreaterThan(1);
    });

    it('builds llms.txt with the site H1, a blockquote summary, and grouped page links', async () => {
        const { 'llms.txt': llms } = await generateSeoFiles({ pages: PAGES, siteUrl: SITE_URL, srcDir });

        // H1 (required) is the site name; blockquote summary uses the home page's
        // rich <meta name="description">.
        expect(llms.startsWith('# Balkan Heritage\n')).toBe(true);
        expect(llms).toContain('> Rich home meta description.');

        // Non-home top-level pages (no `part`) are listed under Overview.
        expect(llms).toContain('## Overview');
        expect(llms).toContain(`- [About](${SITE_URL}/about): Rich about meta description.`);

        // The Part section is titled by its hub page and uses the hub's rich description.
        expect(llms).toContain('## The Ottoman Heritage');
        expect(llms).toContain(`- [The Ottoman Heritage](${SITE_URL}/ottoman/): Rich Ottoman hub meta description.`);

        // The Optional section links the secondary feed/sitemap resources.
        expect(llms).toContain('## Optional');
        expect(llms).toContain(`- [RSS feed](${SITE_URL}/rss.xml)`);
        expect(llms).toContain(`- [Sitemap](${SITE_URL}/sitemap.xml)`);
    });

    it('does not repeat the home page as a file-list entry (it is the H1/blockquote)', async () => {
        const { 'llms.txt': llms } = await generateSeoFiles({ pages: PAGES, siteUrl: SITE_URL, srcDir });

        // The home summary appears once (in the blockquote), not again as a bullet.
        expect(llms.split('Rich home meta description.')).toHaveLength(2);
        // The site root is not emitted as a link item.
        expect(llms).not.toContain(`- [Home](${SITE_URL}/):`);
    });

    it('falls back to the registry description in llms.txt when a page has no meta description', async () => {
        const { 'llms.txt': llms } = await generateSeoFiles({ pages: PAGES, siteUrl: SITE_URL, srcDir });

        // bridge.html has no <meta name="description">, so the short registry
        // description is used instead of a parsed one.
        expect(llms).toContain(`- [The Bridge](${SITE_URL}/bridge): A bridge`);
    });

    it('throws a clear error when a page is missing a valid datePublished', async () => {
        const pagesWithBadDate = [
            { ...PAGES[0], datePublished: undefined },
        ];

        await expect(
            generateSeoFiles({ pages: pagesWithBadDate, siteUrl: SITE_URL, srcDir })
        ).rejects.toThrow(/missing or invalid `datePublished`/);
    });
});
