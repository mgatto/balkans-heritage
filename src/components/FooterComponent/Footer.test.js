import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Importing the module registers <balkans-footer>. It pulls in footer.html via `?inline`
// (handled by the html-inline-test plugin in vitest.config.mjs) plus CSS/image assets.
import './Footer.js';

function mount() {
    const el = document.createElement('balkans-footer');
    document.body.appendChild(el);
    return el;
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
});

describe('Footer', () => {
    it('renders exactly one contentinfo <footer> (no nested-landmark regression)', () => {
        const el = mount();
        expect(el.shadowRoot.querySelectorAll('footer')).toHaveLength(1);
    });

    it('fills in the current year with era, formatted via Intl', () => {
        const el = mount();
        const expected = new Intl.DateTimeFormat('en-US', { year: 'numeric', era: 'short' }).format(new Date());
        expect(el.shadowRoot.querySelector('.year').textContent).toBe(expected);
    });

    it('rewrites the logo srcs off the network-free placeholder to imported assets', () => {
        const el = mount();

        const cc = el.shadowRoot.querySelector('.cc-logo');
        expect(cc.getAttribute('src')).not.toBe('data:,');
        expect(cc.getAttribute('src')).toContain('CC');

        const humans = el.shadowRoot.querySelector('.humanstxt-logo');
        expect(humans.getAttribute('src')).not.toBe('data:,');
        expect(humans.getAttribute('src')).toContain('humanstxt');
    });

    it('links to the About page from the footer nav', () => {
        const el = mount();
        const link = el.shadowRoot.querySelector('.footer-nav a');
        expect(link.getAttribute('href')).toBe('/about');
        expect(link.textContent).toBe('About');
    });
});
