// Unit tests for the audio conversion pipeline's pure logic — output naming,
// skip rules, and command construction — without invoking real ffmpeg.
import { describe, expect, it } from 'vitest';
import { destFor, planConversion } from './convert-audio.mjs';

describe('destFor', () => {
    it('replaces the .mp3 extension with the target extension', () => {
        expect(destFor('/a/b/sadrvan.mp3', '.webm')).toBe('/a/b/sadrvan.webm');
        expect(destFor('/a/b/sadrvan.mp3', '.m4a')).toBe('/a/b/sadrvan.m4a');
    });

    it('only touches the trailing extension', () => {
        expect(destFor('/a/mp3.files/sadrvan.mp3', '.webm')).toBe('/a/mp3.files/sadrvan.webm');
    });
});

describe('planConversion', () => {
    it('builds the Opus/WebM and AAC/M4A plans for every source', () => {
        const plans = planConversion('/x/sadrvan.mp3');
        expect(plans).toHaveLength(2);
        expect(plans[0].dest).toBe('/x/sadrvan.webm');
        expect(plans[1].dest).toBe('/x/sadrvan.m4a');
    });

    it('keeps the mp3 as an untouched legacy fallback (never an output)', () => {
        const plans = planConversion('/x/sadrvan.mp3');
        expect(plans.every((p) => p.dest !== '/x/sadrvan.mp3')).toBe(true);
    });

    it('encodes voice-optimized settings in the ffmpeg argument lists', () => {
        const [webm, m4a] = planConversion('/x/sadrvan.mp3');
        expect(webm.args).toContain('libopus');
        expect(webm.args).toContain('24k');
        expect(m4a.args).toContain('aac');
        expect(m4a.args).toContain('32k');
        expect(m4a.args).toContain('+faststart');
    });

    it('marks the correct codec for post-conversion verification', () => {
        const [webm, m4a] = planConversion('/x/sadrvan.mp3');
        expect(webm.codec).toBe('opus');
        expect(m4a.codec).toBe('aac');
    });
});
