import { describe, expect, it } from 'vitest';
import {
    normalizeText,
    matchFeature,
    buildQueryUrl,
    parseBugzillaResponse,
    formatBugEntry,
    formatFeatureSection,
} from './browser-bugs.mjs';

// A tiny stand-in for COMPONENT_MAP: enough shape to exercise matching without depending on the
// real, growing map.
const MAP = {
    grid: {
        name: 'CSS Grid',
        aliases: ['css grid', 'grid layout'],
        components: [
            { vendor: 'firefox', product: 'Core', component: 'Layout: Grid' },
            { vendor: 'webkit', product: 'WebKit', component: 'CSS' },
        ],
    },
    'flexbox-gap': {
        name: 'Flexbox gap',
        aliases: ['flexbox', 'flex gap'],
        components: [{ vendor: 'firefox', product: 'Core', component: 'Layout: Flexbox' }],
    },
    avif: {
        name: 'AVIF',
        aliases: ['av1 image'],
        components: [{ vendor: 'firefox', product: 'Core', component: 'ImageLib' }],
    },
};

describe('normalizeText', () => {
    it('lowercases and collapses non-alphanumerics to single spaces', () => {
        expect(normalizeText('Clip-Path')).toBe('clip path');
        expect(normalizeText('  min(), max(), and clamp()  ')).toBe('min max and clamp');
        expect(normalizeText('CSS   Grid')).toBe('css grid');
    });
});

describe('matchFeature', () => {
    it('matches on the exact id', () => {
        expect(matchFeature('grid', MAP)).toEqual(['grid']);
    });

    it('matches when the user term is broader than the id (term includes id)', () => {
        // "css grid layout" contains "grid"
        expect(matchFeature('css grid layout', MAP)).toContain('grid');
    });

    it('matches when the user term is narrower than an alias (alias includes term)', () => {
        // alias "flexbox" includes the narrower "flex"
        expect(matchFeature('flex', MAP)).toEqual(['flexbox-gap']);
    });

    it('matches case-insensitively via name', () => {
        expect(matchFeature('AVIF', MAP)).toEqual(['avif']);
    });

    it('returns an empty array for an empty term', () => {
        expect(matchFeature('', MAP)).toEqual([]);
        expect(matchFeature('   ', MAP)).toEqual([]);
    });

    it('returns an empty array when nothing matches', () => {
        expect(matchFeature('container queries', MAP)).toEqual([]);
    });

    it('is permissive: a superstring term like "subgrid" still matches "grid"', () => {
        // Bidirectional substring matching is deliberate for this warn-only tool — the human
        // sees (and can ignore) a loose hit rather than getting a false "no mapping" dead end.
        expect(matchFeature('subgrid', MAP)).toEqual(['grid']);
    });
});

describe('buildQueryUrl', () => {
    const base = 'https://bugzilla.mozilla.org/rest/bug';

    it('builds an open-bug query with resolution=--- and no date', () => {
        const url = new URL(buildQueryUrl(base, { product: 'Core', component: 'Layout: Grid', mode: 'open', floorDate: '2022-06-28T00:00:00Z' }));
        expect(url.origin + url.pathname).toBe('https://bugzilla.mozilla.org/rest/bug');
        expect(url.searchParams.get('product')).toBe('Core');
        expect(url.searchParams.get('component')).toBe('Layout: Grid');
        expect(url.searchParams.get('resolution')).toBe('---');
        expect(url.searchParams.get('last_change_time')).toBeNull();
        expect(url.searchParams.get('limit')).toBe('20');
    });

    it('builds a recently-fixed query with resolution=FIXED and the floor date', () => {
        const url = new URL(buildQueryUrl(base, { product: 'Core', component: 'ImageLib', mode: 'fixed', floorDate: '2022-06-28T00:00:00Z' }));
        expect(url.searchParams.get('resolution')).toBe('FIXED');
        expect(url.searchParams.get('last_change_time')).toBe('2022-06-28T00:00:00Z');
    });

    it('url-encodes component names with spaces and punctuation', () => {
        const raw = buildQueryUrl(base, { product: 'Core', component: 'Layout: Images, Video, and HTML Frames', mode: 'open', floorDate: 'x' });
        // The raw query string must not contain a literal space or comma in the component value.
        const query = raw.split('?')[1];
        expect(query).not.toMatch(/component=[^&]*[ ]/);
        // And it round-trips back to the original value.
        expect(new URL(raw).searchParams.get('component')).toBe('Layout: Images, Video, and HTML Frames');
    });

    it('honors a custom limit', () => {
        const url = new URL(buildQueryUrl(base, { product: 'Core', component: 'CSS', mode: 'open', floorDate: 'x', limit: 5 }));
        expect(url.searchParams.get('limit')).toBe('5');
    });
});

describe('parseBugzillaResponse', () => {
    it('normalizes bug records', () => {
        const parsed = parseBugzillaResponse({
            bugs: [
                { id: 123, summary: '  grid baseline bug  ', status: 'NEW', resolution: '', last_change_time: '2026-07-12T09:00:00Z' },
                { id: 456, summary: 'fixed thing', status: 'RESOLVED', resolution: 'FIXED', last_change_time: '2024-03-10T00:00:00Z' },
            ],
        });
        expect(parsed).toHaveLength(2);
        expect(parsed[0]).toEqual({ id: 123, summary: 'grid baseline bug', status: 'NEW', resolution: '', lastChanged: '2026-07-12T09:00:00Z' });
        expect(parsed[1].resolution).toBe('FIXED');
    });

    it('returns an empty array when bugs is missing or not an array', () => {
        expect(parseBugzillaResponse({})).toEqual([]);
        expect(parseBugzillaResponse({ bugs: null })).toEqual([]);
        expect(parseBugzillaResponse(null)).toEqual([]);
    });

    it('tolerates missing per-bug fields', () => {
        const parsed = parseBugzillaResponse({ bugs: [{ id: 7 }] });
        expect(parsed[0]).toEqual({ id: 7, summary: '', status: '', resolution: '', lastChanged: null });
    });
});

describe('formatBugEntry', () => {
    const show = 'https://bugzilla.mozilla.org/show_bug.cgi?id=';

    it('renders an open bug with status and date', () => {
        const line = formatBugEntry({ id: 123, summary: 'grid baseline bug', status: 'NEW', resolution: '', lastChanged: '2026-07-12T09:00:00Z' }, show);
        expect(line).toBe('- [Bug 123] grid baseline bug (NEW, 2026-07-12)\n  https://bugzilla.mozilla.org/show_bug.cgi?id=123');
    });

    it('renders a resolved bug with status + resolution', () => {
        const line = formatBugEntry({ id: 456, summary: 'fixed thing', status: 'RESOLVED', resolution: 'FIXED', lastChanged: '2024-03-10T00:00:00Z' }, show);
        expect(line).toContain('(RESOLVED FIXED, 2024-03-10)');
        expect(line).toContain('id=456');
    });

    it('omits the parenthetical when there is no status or date', () => {
        const line = formatBugEntry({ id: 9, summary: 'bare', status: '', resolution: '', lastChanged: null }, show);
        expect(line).toBe('- [Bug 9] bare\n  https://bugzilla.mozilla.org/show_bug.cgi?id=9');
    });
});

describe('formatFeatureSection', () => {
    const feature = {
        id: 'grid',
        name: 'CSS Grid',
        vendors: [
            {
                label: 'Firefox',
                product: 'Core',
                component: 'Layout: Grid',
                showBase: 'https://bugzilla.mozilla.org/show_bug.cgi?id=',
                open: { bugs: [{ id: 1, summary: 'open one', status: 'NEW', resolution: '', lastChanged: '2026-01-01T00:00:00Z' }], error: null },
                fixed: { bugs: [], error: null },
            },
            {
                label: 'WebKit / Safari',
                product: 'WebKit',
                component: 'CSS',
                showBase: 'https://bugs.webkit.org/show_bug.cgi?id=',
                open: { bugs: [], error: 'HTTP 503' },
                fixed: { bugs: [], error: null },
            },
        ],
    };

    it('renders a heading, per-vendor groups, counts, none-notes, and error-notes', () => {
        const section = formatFeatureSection(feature, '2022-06-28T00:00:00Z');
        expect(section).toContain('## CSS Grid (grid)');
        expect(section).toContain('### Firefox — Core / Layout: Grid');
        expect(section).toContain('Open (1):');
        expect(section).toContain('- [Bug 1] open one (NEW, 2026-01-01)');
        expect(section).toContain('Recently fixed (changed since 2022-06-28): none');
        expect(section).toContain('### WebKit / Safari — WebKit / CSS');
        expect(section).toContain('Open: unavailable (HTTP 503)');
    });
});
