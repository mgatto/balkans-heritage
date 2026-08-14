// Generates sitemap.xml, rss.xml, and robots.txt from an explicit page registry
// (defined alongside build.rollupOptions.input in vite.config.js) so they can't
// drift out of sync as pages are added, renamed, or removed. Invoked from
// vite.config.js's `closeBundle` hook during `npm run build`.
//
// XML generation is delegated to maintained libraries rather than hand-rolled
// strings: `sitemap` for the sitemap, `feed` for the RSS feed. Per-page metadata
// (title, description) comes from the registry rather than being scraped out of
// the HTML, so there's no fragile regex/entity/comment handling. robots.txt is a
// few lines of plain text, so it's assembled directly from the SITE_URL constant.

import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Feed } from 'feed';
import { SitemapStream, streamToPromise } from 'sitemap';

const CHANNEL_TITLE = 'Poetic Tour of the Balkans';
const CHANNEL_DESCRIPTION =
    'A poetic tour of the Balkans\' layered cultural heritage, landmark by landmark.';

// Home gets top priority; every other page a notch below.
function priorityFor(route) {
    return route === '/' ? 1.0 : 0.8;
}

function lastModified(srcDir, file) {
    return statSync(resolve(srcDir, file)).mtime;
}

async function renderSitemap(pages, siteUrl, srcDir) {
    const stream = new SitemapStream({ hostname: siteUrl });

    for (const page of pages) {
        stream.write({
            url: page.route,
            changefreq: 'monthly',
            priority: priorityFor(page.route),
            lastmod: lastModified(srcDir, page.file).toISOString(),
        });
    }
    stream.end();

    const xml = (await streamToPromise(stream)).toString();
    return `${xml}\n`;
}

function renderRss(pages, siteUrl, srcDir) {
    const feed = new Feed({
        title: CHANNEL_TITLE,
        description: CHANNEL_DESCRIPTION,
        id: `${siteUrl}/`,
        link: `${siteUrl}/`,
        language: 'en',
        generator: 'balkans-heritage build',
        copyright: `Copyright ${new Date().getFullYear()} Michael Gatto`,
    });

    for (const page of pages) {
        const url = `${siteUrl}${page.route}`;
        feed.addItem({
            title: page.title,
            id: url,
            link: url,
            description: page.description,
            date: lastModified(srcDir, page.file),
        });
    }

    return `${feed.rss2()}\n`;
}

function renderRobots(siteUrl) {
    return `# Generated during \`npm run build\` — do not edit by hand.
# Uses a placeholder domain pending the canonical domain decision; see docs/future/seo-modernization.md.
User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;
}

/**
 * @param {object} options
 * @param {Array<{name: string, file: string, route: string, title: string, description: string}>} options.pages
 *   the page registry shared with `build.rollupOptions.input` in vite.config.js.
 * @param {string} options.siteUrl - canonical origin, no trailing slash.
 * @param {string} options.srcDir - absolute path to the `src` directory (used for lastmod mtimes).
 * @returns {Promise<Record<string, string>>} filename -> file contents, ready to write into `dist/`.
 */
export async function generateSeoFiles({ pages, siteUrl, srcDir }) {
    return {
        'sitemap.xml': await renderSitemap(pages, siteUrl, srcDir),
        'rss.xml': renderRss(pages, siteUrl, srcDir),
        'robots.txt': renderRobots(siteUrl),
    };
}
