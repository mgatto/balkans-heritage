import { afterEach, describe, expect, it } from 'vitest';

// Importing the module registers <balkans-mast>. The MedallionMast class isn't exported,
// so static members are reached through the registry.
import './MedallionMast.js';

const MedallionMast = customElements.get('balkans-mast');

function mount(attrs = {}) {
    const el = document.createElement('balkans-mast');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    return el;
}

function rects(el) {
    return [...el.shadowRoot.querySelectorAll('rect')];
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('MedallionMast country mode', () => {
    it.each([
        ['balkans', ['#E30A17', '#fff', '#E30A17']],
        ['kosovo', ['#ed1c24', '#cfa550', '#1d3c85']],
        ['bosnia', ['#eec900', '#fff', '#003e9e']],
    ])('renders the %s flag palette with a medallion', (country, colors) => {
        const el = mount({ country });
        const bands = rects(el);

        expect(bands).toHaveLength(3);
        expect(bands.map((r) => r.getAttribute('fill'))).toEqual(colors);

        // The emblem is bundled by Vite (small SVGs are inlined as data: URIs), so assert
        // a medallion is present with a resolved src rather than matching a filename.
        const img = el.shadowRoot.querySelector('#medallion img');
        expect(img).not.toBeNull();
        expect(img.getAttribute('src')).toBeTruthy();
    });

    it('picks a distinct medallion image per country', () => {
        const src = (country) => mount({ country }).shadowRoot.querySelector('#medallion img').getAttribute('src');
        const srcs = [src('balkans'), src('kosovo'), src('bosnia')];
        expect(new Set(srcs).size).toBe(3);
    });

    it('divides the 30px mast evenly across 3 bands (height 10, stacked y offsets)', () => {
        const bands = rects(mount({ country: 'balkans' }));
        expect(bands.map((r) => r.getAttribute('height'))).toEqual(['10', '10', '10']);
        expect(bands.map((r) => r.getAttribute('y'))).toEqual(['0', '10', '20']);
    });

    it('exposes the country via its property accessor', () => {
        const el = document.createElement('balkans-mast');
        el.country = 'bosnia';
        expect(el.country).toBe('bosnia');
    });
});

describe('MedallionMast parts mode', () => {
    it('renders four era bands and no medallion', () => {
        const el = mount({ parts: '' });
        const bands = rects(el);

        expect(bands).toHaveLength(4);
        expect(bands.map((r) => r.getAttribute('fill'))).toEqual(MedallionMast.partColors);
        expect(el.shadowRoot.querySelector('#medallion')).toBeNull();
    });

    it('divides the 30px mast evenly across 4 bands (height 7.5)', () => {
        const bands = rects(mount({ parts: '' }));
        expect(bands.map((r) => r.getAttribute('height'))).toEqual(['7.5', '7.5', '7.5', '7.5']);
        expect(bands.map((r) => r.getAttribute('y'))).toEqual(['0', '7.5', '15', '22.5']);
    });
});

describe('MedallionMast.partColors', () => {
    it('returns the four era colors in chronological order', () => {
        expect(MedallionMast.partColors).toEqual(['#66023c', '#007f00', '#FFDD11', '#DE0000']);
    });
});

describe('MedallionMast edge cases', () => {
    // connectedCallback is invoked directly (rather than via appendChild) so the thrown
    // error propagates to the assertion instead of being reported to the jsdom window.
    it('throws on an unknown country (no flag config)', () => {
        const el = document.createElement('balkans-mast');
        el.setAttribute('country', 'atlantis');
        expect(() => el.connectedCallback()).toThrow();
    });

    it('throws when neither a country nor parts is provided', () => {
        const el = document.createElement('balkans-mast');
        expect(() => el.connectedCallback()).toThrow();
    });
});
