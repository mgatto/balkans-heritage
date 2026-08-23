import { afterEach, describe, expect, it, vi } from 'vitest';

// Vitest isolates modules per test file, so mocking the inline template here (to markup
// that lacks .year/.cc-logo/.humanstxt-logo) exercises Footer's defensive `if (el)`
// guards — the false branches the main suite can't reach with the real template — without
// affecting Footer.test.js.
vi.mock('./footer.html?inline', () => ({ default: '<footer><p>minimal</p></footer>' }));

import './Footer.js';

afterEach(() => {
    document.body.innerHTML = '';
});

describe('Footer with a template missing its wired elements', () => {
    it('renders without throwing when .year and logo elements are absent', () => {
        const el = document.createElement('balkans-footer');
        expect(() => document.body.appendChild(el)).not.toThrow();

        expect(el.shadowRoot.querySelector('footer')).not.toBeNull();
        expect(el.shadowRoot.querySelector('.year')).toBeNull();
        expect(el.shadowRoot.querySelector('.cc-logo')).toBeNull();
        expect(el.shadowRoot.querySelector('.humanstxt-logo')).toBeNull();
    });
});
