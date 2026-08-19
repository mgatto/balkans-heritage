import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateSeoFiles } from './generate-seo-files.mjs';

const SITE_URL = 'https://example.test';

const PAGES = [
    { name: 'main', file: 'index.html', route: '/', title: 'Home', description: 'Home page', datePublished: '2020-01-01' },
    { name: 'bridge', file: 'bridge.html', route: '/bridge', title: 'The Bridge', description: 'A bridge', datePublished: '2020-01-02' },
];

// generateSeoFiles() reads real file mtimes for the sitemap's lastmod, so each
// test gets a throwaway srcDir with just enough fixture files to satisfy that
// (rather than depending on the real src/*.html files, which would make tests
// brittle to unrelated content changes).
let srcDir;

beforeEach(() => {
    srcDir = mkdtempSync(join(tmpdir(), 'balkans-heritage-seo-'));
    for (const page of PAGES) {
        writeFileSync(join(srcDir, page.file), '<!doctype html><title>fixture</title>');
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
    it('returns exactly sitemap.xml, rss.xml, and robots.txt', async () => {
        const files = await generateSeoFiles({ pages: PAGES, siteUrl: SITE_URL, srcDir });
        expect(Object.keys(files).sort()).toEqual(['robots.txt', 'rss.xml', 'sitemap.xml']);
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

        expect(robotsTxt).toContain('Allow: /');
        expect(robotsTxt).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
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
