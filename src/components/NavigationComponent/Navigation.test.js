import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Importing the module registers the <balkans-navigation> custom element (guarded by
// customElements.get, so re-import across the suite is a no-op). The Navigation class
// isn't exported, so its static members are reached through the registry.
import './Navigation.js';

const Navigation = customElements.get('balkans-navigation');

// A realistic registry mirroring the shape vite.config.js's `define` injects into
// __NAV_PAGES__ (name/route/navLabel/title/part/nav). `fountain` deliberately omits
// navLabel to exercise the `navLabel ?? title` fallback; `ottoman` is a Part hub
// (nav + part) so it gets the `.part-hub` class, while Home (no part) does not.
const FIXTURE = [
    { name: 'main', route: '/', navLabel: 'Home', title: 'Poetic Tour', part: null, nav: true },
    { name: 'ottoman', route: '/ottoman/', navLabel: 'Ottoman', title: 'The Ottoman Heritage', part: 'ottoman', nav: true },
    { name: 'fountain', route: '/ottoman/fountain', title: 'The Fountain', part: 'ottoman', nav: false },
    { name: 'bridge', route: '/ottoman/bridge', navLabel: 'Bridge', title: 'The Bridge', part: 'ottoman', nav: false },
    // A utility page: in the registry but neither in the nav bar nor part of a section.
    { name: 'about', route: '/about', navLabel: 'About', title: 'About', part: null, nav: false },
];

// __NAV_PAGES__ is defined (in vitest.config.mjs) as globalThis.__NAV_PAGES__, so the
// registry is set here per-test and can be varied (empty, orphaned part, etc.).
function mount(path = '/') {
    window.history.pushState({}, '', path);
    const el = document.createElement('balkans-navigation');
    document.body.appendChild(el);
    return el;
}

beforeEach(() => {
    globalThis.__NAV_PAGES__ = FIXTURE;
});

afterEach(() => {
    document.body.innerHTML = '';
    window.history.pushState({}, '', '/');
    delete globalThis.__NAV_PAGES__;
});

describe('Navigation.normalizePath', () => {
    it.each([
        ['/', '/'],
        ['', '/'],
        ['/index.html', '/'],
        ['/ottoman/', '/ottoman'],
        ['/ottoman/index.html', '/ottoman'],
        ['/ottoman/bridge', '/ottoman/bridge'],
        ['/ottoman/bridge.html', '/ottoman/bridge'],
    ])('normalizes %j to %j', (input, expected) => {
        expect(Navigation.normalizePath(input)).toBe(expected);
    });
});

describe('Navigation.currentPage', () => {
    it('matches the home route', () => {
        const el = mount('/');
        expect(el.currentPage.name).toBe('main');
    });

    it('matches a trailing-slash hub route from an extensionless path', () => {
        const el = mount('/ottoman');
        expect(el.currentPage.name).toBe('ottoman');
    });

    it('matches a .html path to its extensionless registry route', () => {
        const el = mount('/ottoman/bridge.html');
        expect(el.currentPage.name).toBe('bridge');
    });

    it('returns null for a path not in the registry', () => {
        const el = mount('/does/not/exist');
        expect(el.currentPage).toBeNull();
    });
});

describe('Navigation.sectionLandmarks', () => {
    it('is empty on a page without a part (Home)', () => {
        const el = mount('/');
        expect(el.sectionLandmarks).toEqual([]);
    });

    it('lists the section\'s non-nav landmarks on a landmark page', () => {
        const el = mount('/ottoman/bridge');
        expect(el.sectionLandmarks.map((p) => p.name)).toEqual(['fountain', 'bridge']);
    });
});

describe('Navigation primary bar rendering', () => {
    it('lists exactly the nav pages with correct hrefs and labels', () => {
        const el = mount('/');
        const links = [...el.shadowRoot.querySelectorAll('nav.primary ol > li > a')];
        expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/ottoman/']);
        expect(links.map((a) => a.textContent)).toEqual(['Home', 'Ottoman']);
    });

    it('marks a Part hub with .part-hub but not Home', () => {
        const el = mount('/');
        expect(el.shadowRoot.getElementById('ottoman_link').classList.contains('part-hub')).toBe(true);
        expect(el.shadowRoot.getElementById('main_link').classList.contains('part-hub')).toBe(false);
    });
});

describe('Navigation active-state marking', () => {
    it('dims the current top-level page (aria-current="page")', () => {
        const el = mount('/');
        const li = el.shadowRoot.getElementById('main_link');
        expect(li.classList.contains('active')).toBe(true);
        expect(li.querySelector('a').getAttribute('aria-current')).toBe('page');
    });

    it('highlights the parent hub and dims the current landmark on a landmark page', () => {
        const el = mount('/ottoman/bridge');

        const hub = el.shadowRoot.getElementById('ottoman_link');
        expect(hub.classList.contains('current-section')).toBe(true);
        expect(hub.querySelector('a').getAttribute('aria-current')).toBe('true');

        const own = el.shadowRoot.getElementById('bridge_sublink');
        expect(own.classList.contains('active')).toBe(true);
        expect(own.querySelector('a').getAttribute('aria-current')).toBe('page');
    });
});

describe('Navigation sub-bar rendering', () => {
    it('is absent on Home', () => {
        const el = mount('/');
        expect(el.shadowRoot.querySelector('nav.subnav')).toBeNull();
    });

    it('renders the section sub-bar labelled by the hub inside a section', () => {
        const el = mount('/ottoman/bridge');
        const subnav = el.shadowRoot.querySelector('nav.subnav');
        expect(subnav).not.toBeNull();
        expect(subnav.getAttribute('aria-label')).toBe('Ottoman section');
        const sublinks = [...subnav.querySelectorAll('ol > li > a')];
        expect(sublinks.map((a) => a.textContent)).toEqual(['The Fountain', 'Bridge']);
    });

    it('falls back to title when a landmark has no navLabel', () => {
        const el = mount('/ottoman/bridge');
        expect(el.shadowRoot.getElementById('fountain_sublink').querySelector('a').textContent).toBe('The Fountain');
    });
});

describe('Navigation edge cases', () => {
    it('applies no active state on an in-registry utility page (no nav, no part)', () => {
        const el = mount('/about');
        expect(el.currentPage.name).toBe('about');
        expect(el.shadowRoot.querySelector('[aria-current]')).toBeNull();
        expect(el.shadowRoot.querySelector('nav.subnav')).toBeNull();
    });

    it('labels the section sub-bar with the hub title when the hub has no navLabel', () => {
        globalThis.__NAV_PAGES__ = [
            { name: 'main', route: '/', navLabel: 'Home', title: 'Home', part: null, nav: true },
            { name: 'habsburg', route: '/habsburg/', title: 'The Habsburg Heritage', part: 'habsburg', nav: true },
            { name: 'opera', route: '/habsburg/opera', navLabel: 'Opera', title: 'The Opera', part: 'habsburg', nav: false },
        ];
        const el = mount('/habsburg/opera');
        expect(el.shadowRoot.querySelector('nav.subnav').getAttribute('aria-label')).toBe('The Habsburg Heritage section');
    });

    it('renders the primary bar but no active state for an unknown location', () => {
        const el = mount('/nowhere');
        expect(el.shadowRoot.querySelectorAll('nav.primary ol > li')).toHaveLength(2);
        expect(el.shadowRoot.querySelector('[aria-current]')).toBeNull();
    });

    it('renders an empty primary bar without throwing on an empty registry', () => {
        globalThis.__NAV_PAGES__ = [];
        const el = mount('/');
        const ol = el.shadowRoot.querySelector('nav.primary ol');
        expect(ol).not.toBeNull();
        expect(ol.querySelectorAll('li')).toHaveLength(0);
    });

    it('is a no-op when the hub link for a landmark\'s part is absent', () => {
        // `orphan` has part "ghost", but there is no "ghost" hub in the bar, so
        // markActive("ghost_link", ...) finds no element and must return quietly.
        globalThis.__NAV_PAGES__ = [
            { name: 'main', route: '/', navLabel: 'Home', title: 'Home', part: null, nav: true },
            { name: 'orphan', route: '/ghost/orphan', navLabel: 'Orphan', title: 'Orphan', part: 'ghost', nav: false },
        ];
        const el = mount('/ghost/orphan');

        expect(el.shadowRoot.getElementById('ghost_link')).toBeNull();
        const own = el.shadowRoot.getElementById('orphan_sublink');
        expect(own.classList.contains('active')).toBe(true);
        expect(own.querySelector('a').getAttribute('aria-current')).toBe('page');
    });
});
