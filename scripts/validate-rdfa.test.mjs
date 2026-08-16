import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extract, resolveFiles } from './validate-rdfa.mjs';

let dir;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'balkans-heritage-rdfa-'));
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('extract', () => {
    it('extracts the RDFa triples embedded in an HTML fixture', async () => {
        const file = join(dir, 'fixture.html');
        writeFileSync(
            file,
            '<html><body vocab="http://schema.org/">' +
                '<main typeof="TouristAttraction"><span property="name" content="Fixture Bridge"></span></main>' +
                '</body></html>'
        );

        const triples = await extract(file);

        expect(triples.some((t) => t.includes('http://schema.org/name') && t.includes('Fixture Bridge'))).toBe(true);
    });

    it('resolves with zero triples for plain HTML with no RDFa', async () => {
        const file = join(dir, 'plain.html');
        writeFileSync(file, '<html><body><p>Just text, no vocabulary.</p></body></html>');

        await expect(extract(file)).resolves.toEqual([]);
    });

    it('rejects (rather than crashing) when the file does not exist', async () => {
        await expect(extract(join(dir, 'does-not-exist.html'))).rejects.toThrow(/ENOENT/);
    });
});

describe('resolveFiles', () => {
    it('returns explicit args unchanged', async () => {
        await expect(resolveFiles(['a.html', 'b.html'])).resolves.toEqual(['a.html', 'b.html']);
    });

    it('defaults to a sorted list of the real src/*.html pages when no args are given', async () => {
        const files = await resolveFiles([]);

        expect(files.length).toBeGreaterThan(0);
        expect(files.every((f) => f.startsWith('src/') && f.endsWith('.html'))).toBe(true);
        expect(files).toEqual([...files].sort());
    });
});
