import { describe, expect, it } from 'vitest';
import {
    snapshotFeatures,
    diffBaseline,
    rootGroupOf,
    isRelevantFeature,
    filterAlreadyTracked,
    earliestSupported,
    formatFeatureEntry,
    formatLogSection,
    parseFeed,
    selectNewBlogEntries,
    compareVersions,
    parseReleaseIndex,
    selectNewReleases,
    queryWebFeatures,
    flattenBcd,
    queryBcd,
} from './browser-feature-intel.mjs';

// A tiny stand-in for the web-features dataset: two real features (one CSS, one JS) plus a
// redirect entry, so tests exercise the kind/group/baseline handling without depending on
// the real, ever-changing dataset.
const FEATURES = {
    'grid': {
        kind: 'feature',
        name: 'Grid',
        description: 'CSS grid layout.',
        group: 'grid',
        caniuse: 'css-grid',
        spec: 'https://example.test/grid',
        status: { baseline: 'high', baseline_low_date: '2017-10-17', baseline_high_date: '2020-04-17' },
    },
    'promises': {
        kind: 'feature',
        name: 'Promises',
        description: 'JS promises.',
        group: 'promises',
        spec: ['https://example.test/promises'],
        status: { baseline: 'high', baseline_low_date: '2015-01-01', baseline_high_date: '2017-01-01' },
    },
    'anchor-positioning': {
        kind: 'feature',
        name: 'Anchor positioning',
        description: 'Place an element relative to another.',
        group: ['positioning'],
        caniuse: ['css-anchor-positioning'],
        spec: 'https://example.test/anchor',
        status: { baseline: 'low', baseline_low_date: '2026-01-01' },
    },
    'old-redirect': { kind: 'moved', redirect_target: 'grid' },
};

const GROUPS = {
    css: { name: 'CSS' },
    layout: { name: 'Layout', parent: 'css' },
    grid: { name: 'Grid', parent: 'layout' },
    positioning: { name: 'Positioning', parent: 'layout' },
    javascript: { name: 'JavaScript' },
    promises: { name: 'Promises', parent: 'javascript' },
};

describe('snapshotFeatures', () => {
    it('captures baseline facts for real features and skips redirects', () => {
        const snap = snapshotFeatures(FEATURES);
        expect(Object.keys(snap).sort()).toEqual(['anchor-positioning', 'grid', 'promises']);
        expect(snap.grid).toEqual({ baseline: 'high', low: '2017-10-17', high: '2020-04-17' });
        expect(snap['anchor-positioning']).toEqual({ baseline: 'low', low: '2026-01-01', high: null });
    });
});

describe('diffBaseline', () => {
    it('flags features that advanced in baseline rank', () => {
        const previous = {
            grid: { baseline: 'low' },
            promises: { baseline: 'high' },
        };
        const current = {
            grid: { baseline: 'high' }, // low -> high (advanced)
            promises: { baseline: 'high' }, // unchanged
        };
        const advanced = diffBaseline(previous, current);
        expect(advanced).toHaveLength(1);
        expect(advanced[0]).toMatchObject({ id: 'grid', fromBaseline: 'low', toBaseline: 'high', isNew: false });
    });

    it('flags brand-new ids that arrive at newly/widely available', () => {
        const advanced = diffBaseline({}, { foo: { baseline: 'low' }, bar: { baseline: false } });
        expect(advanced).toHaveLength(1);
        expect(advanced[0]).toMatchObject({ id: 'foo', isNew: true, toBaseline: 'low' });
    });

    it('ignores features that did not advance', () => {
        const advanced = diffBaseline({ grid: { baseline: 'high' } }, { grid: { baseline: 'high' } });
        expect(advanced).toEqual([]);
    });
});

describe('rootGroupOf', () => {
    it('walks the parent chain to the root group', () => {
        expect(rootGroupOf('grid', GROUPS)).toBe('css');
        expect(rootGroupOf('promises', GROUPS)).toBe('javascript');
        expect(rootGroupOf('css', GROUPS)).toBe('css');
    });
});

describe('isRelevantFeature', () => {
    it('treats CSS-rooted features as in scope and JS-rooted features as out of scope', () => {
        expect(isRelevantFeature(FEATURES.grid, GROUPS)).toBe(true);
        expect(isRelevantFeature(FEATURES['anchor-positioning'], GROUPS)).toBe(true);
        expect(isRelevantFeature(FEATURES.promises, GROUPS)).toBe(false);
    });

    it('is out of scope when a feature has no group', () => {
        expect(isRelevantFeature({ kind: 'feature' }, GROUPS)).toBe(false);
    });
});

describe('filterAlreadyTracked', () => {
    const flagged = [{ id: 'grid' }, { id: 'anchor-positioning' }];

    it('drops features already named by id in the checklist text', () => {
        const kept = filterAlreadyTracked(flagged, 'We already cover css grid here.', FEATURES);
        expect(kept.map((f) => f.id)).toEqual(['anchor-positioning']);
    });

    it('drops features already named by human name (case-insensitive)', () => {
        const kept = filterAlreadyTracked(flagged, 'Anchor Positioning is on the list.', FEATURES);
        expect(kept.map((f) => f.id)).toEqual(['grid']);
    });

    it('keeps everything when the checklist mentions none of them', () => {
        const kept = filterAlreadyTracked(flagged, 'nothing relevant', FEATURES);
        expect(kept).toHaveLength(2);
    });
});

describe('earliestSupported', () => {
    it('reports the earliest fully-supported version per browser', () => {
        const stats = {
            chrome: { '56': 'n', '57': 'y', '58': 'y' },
            firefox: { '51': 'n', '52': 'y' },
            safari: { '10': 'n' },
        };
        const since = earliestSupported(stats, [['chrome', 'Chrome'], ['firefox', 'Firefox'], ['safari', 'Safari']]);
        expect(since).toEqual({ Chrome: '57', Firefox: '52' });
    });

    it('counts prefixed "y x" as full support and flags partial-only as partial', () => {
        const stats = {
            chrome: { '20': 'y x', '21': 'y' },
            safari: { '9': 'a', '10': 'a' },
        };
        const since = earliestSupported(stats, [['chrome', 'Chrome'], ['safari', 'Safari']]);
        expect(since).toEqual({ Chrome: '20', Safari: 'partial' });
    });
});

describe('formatFeatureEntry', () => {
    it('renders name, status, support, links, and a triage checkbox', () => {
        const entry = { id: 'anchor-positioning', toBaseline: 'low', fromBaseline: null, isNew: true };
        const caniuse = { id: 'css-anchor-positioning', link: 'https://caniuse.com/css-anchor-positioning', since: { Chrome: '125' } };
        const block = formatFeatureEntry(entry, FEATURES, caniuse);
        expect(block).toContain('### Anchor positioning (`anchor-positioning`)');
        expect(block).toContain('Baseline newly available (since 2026-01-01)');
        expect(block).toContain('newly tracked');
        expect(block).toContain('Support: Chrome 125');
        expect(block).toContain('caniuse: https://caniuse.com/css-anchor-positioning');
        expect(block).toContain('Spec: https://example.test/anchor');
        expect(block).toContain('- [ ] Triaged');
    });
});

describe('formatLogSection', () => {
    it('includes a date heading and a no-findings note when there is nothing new', () => {
        const section = formatLogSection('2026-08-22T12:00:00.000Z', [], [
            { name: 'WebKit', items: [{ title: 'Post', link: 'https://webkit.org/p', date: '2026-08-20T00:00:00.000Z' }] },
        ]);
        expect(section).toContain('## 2026-08-22');
        expect(section).toContain('_No newly-crossed Baseline features in scope since the last run._');
        expect(section).toContain('#### WebKit');
        expect(section).toContain('[Post](https://webkit.org/p)');
    });

    it('notes source errors', () => {
        const section = formatLogSection('2026-08-22T12:00:00.000Z', [], [
            { name: 'Chrome', error: 'HTTP 503', items: [] },
        ]);
        expect(section).toContain('_Source unavailable: HTTP 503_');
    });
});

describe('parseFeed', () => {
    it('parses RSS <item> entries', () => {
        const xml = `<?xml version="1.0"?><rss><channel>
            <item><title>Hello</title><link>https://example.test/a</link><pubDate>Tue, 19 Aug 2026 10:00:00 GMT</pubDate></item>
            <item><title><![CDATA[World]]></title><link>https://example.test/b</link><pubDate>Wed, 20 Aug 2026 10:00:00 GMT</pubDate></item>
        </channel></rss>`;
        const items = parseFeed(xml);
        expect(items).toHaveLength(2);
        expect(items[0].title).toBe('Hello');
        expect(items[0].link).toBe('https://example.test/a');
        expect(items[1].title).toBe('World');
        expect(items[0].date).toMatch(/^2026-08-19T/);
    });

    it('parses Atom <entry> entries with href links', () => {
        const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
            <entry><title>Atom Post</title><link rel="alternate" href="https://example.test/atom"/><updated>2026-08-21T09:00:00Z</updated></entry>
        </feed>`;
        const items = parseFeed(xml);
        expect(items).toHaveLength(1);
        expect(items[0].title).toBe('Atom Post');
        expect(items[0].link).toBe('https://example.test/atom');
        expect(items[0].date).toMatch(/^2026-08-21T/);
    });
});

describe('selectNewBlogEntries', () => {
    const items = [
        { title: 'old', link: 'a', date: '2026-08-01T00:00:00.000Z' },
        { title: 'mid', link: 'b', date: '2026-08-10T00:00:00.000Z' },
        { title: 'new', link: 'c', date: '2026-08-20T00:00:00.000Z' },
    ];

    it('returns only entries newer than lastSeen, newest first', () => {
        const selected = selectNewBlogEntries(items, '2026-08-05T00:00:00.000Z');
        expect(selected.map((i) => i.title)).toEqual(['new', 'mid']);
    });

    it('returns the most recent handful on a first run (no lastSeen)', () => {
        const selected = selectNewBlogEntries(items, null);
        expect(selected[0].title).toBe('new');
        expect(selected.length).toBeLessThanOrEqual(5);
    });
});

describe('compareVersions', () => {
    it('orders versions numerically, segment by segment', () => {
        expect(compareVersions('154', '153')).toBeGreaterThan(0);
        expect(compareVersions('153.1.0', '153')).toBeGreaterThan(0);
        expect(compareVersions('3.6', '3.10')).toBeLessThan(0); // 6 < 10, not lexicographic
        expect(compareVersions('154', '154.0')).toBe(0);
    });
});

describe('parseReleaseIndex', () => {
    const PATTERN = /^\/en-US\/docs\/Mozilla\/Firefox\/Releases\/(\d+(?:\.\d+)?)$/;
    const HTML = `
        <main>
          <ol>
            <li><a href="/en-US/docs/Mozilla/Firefox/Releases/156">Firefox 156 (Nightly)</a></li>
            <li><a href="/en-US/docs/Mozilla/Firefox/Releases/154">Firefox 154 (Stable)</a></li>
          </ol>
        </main>
        <nav><!-- archive duplicates with barer text -->
          <a href="/en-US/docs/Mozilla/Firefox/Releases/154">154</a>
          <a href="/en-US/docs/Mozilla/Firefox/Releases">Release notes for developers</a>
          <a href="/en-US/docs/Web/CSS">CSS</a>
        </nav>`;

    it('extracts version + href + title for matching links, deduped, first occurrence wins', () => {
        const releases = parseReleaseIndex(HTML, PATTERN);
        expect(releases.map((r) => r.version)).toEqual(['156', '154']);
        expect(releases[1]).toEqual({
            version: '154',
            href: '/en-US/docs/Mozilla/Firefox/Releases/154',
            title: 'Firefox 154 (Stable)', // main-content text, not the sidebar's bare "154"
        });
    });

    it('ignores the index link itself and unrelated links', () => {
        const releases = parseReleaseIndex(HTML, PATTERN);
        expect(releases.some((r) => r.href.endsWith('/Releases'))).toBe(false);
        expect(releases.some((r) => r.href.includes('/Web/CSS'))).toBe(false);
    });
});

describe('selectNewReleases', () => {
    const releases = [
        { version: '154', href: 'a', title: 'Firefox 154' },
        { version: '156', href: 'b', title: 'Firefox 156' },
        { version: '153', href: 'c', title: 'Firefox 153' },
    ];

    it('returns versions higher than lastSeen, newest first', () => {
        expect(selectNewReleases(releases, '153').map((r) => r.version)).toEqual(['156', '154']);
    });

    it('returns the newest few on a first run, capped', () => {
        const selected = selectNewReleases(releases, null, 2);
        expect(selected.map((r) => r.version)).toEqual(['156', '154']);
    });

    it('returns nothing when lastSeen is already the newest', () => {
        expect(selectNewReleases(releases, '156')).toEqual([]);
    });
});

describe('queryWebFeatures', () => {
    it('matches on id and name, skipping redirects', () => {
        expect(queryWebFeatures('grid', FEATURES).map((m) => m.id)).toEqual(['grid']);
        expect(queryWebFeatures('anchor', FEATURES).map((m) => m.id)).toEqual(['anchor-positioning']);
        expect(queryWebFeatures('promises', FEATURES).map((m) => m.id)).toEqual(['promises']);
        expect(queryWebFeatures('redirect', FEATURES)).toEqual([]);
    });
});

describe('flattenBcd + queryBcd', () => {
    const BCD = {
        __meta: { version: '1' },
        browsers: { chrome: {} },
        css: {
            properties: {
                'anchor-name': { __compat: { support: { chrome: { version_added: '125' } }, mdn_url: 'https://mdn.test/anchor-name' } },
            },
        },
        api: {
            VirtualKeyboard: { __compat: { support: { chrome: { version_added: '94' } } } },
        },
    };

    it('flattens only nodes carrying __compat, ignoring __meta and browsers', () => {
        const flat = flattenBcd(BCD);
        expect(flat.map((f) => f.path).sort()).toEqual(['api.VirtualKeyboard', 'css.properties.anchor-name']);
    });

    it('substring-matches key paths case-insensitively', () => {
        expect(queryBcd('anchor-name', BCD).map((f) => f.path)).toEqual(['css.properties.anchor-name']);
        expect(queryBcd('virtualkeyboard', BCD).map((f) => f.path)).toEqual(['api.VirtualKeyboard']);
        expect(queryBcd('nonexistent', BCD)).toEqual([]);
    });
});
