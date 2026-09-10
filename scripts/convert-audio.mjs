#!/usr/bin/env node
// Converts the glossary pronunciation mp3s into modern web audio formats:
// WebM/Opus (best for voice in Chrome/Firefox/Edge) and M4A/AAC (Safari/iOS
// fallback), keeping the original mp3 as the legacy fallback. The landmark
// pages then serve all three via <audio><source> (see each page's glossary).
//
// Requires ffmpeg + ffprobe on PATH (Homebrew: `brew install ffmpeg`). The
// script preflights that and fails fast with a remediation hint if they are
// missing or broken. Usage: node scripts/convert-audio.mjs [--dry-run] [--force]

import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const AUDIO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'public', 'assets', 'audio');

// Each output's ffmpeg arguments (after the input file) and the probe used to
// verify it. .m4a is an MP4 container holding AAC; +faststart moves the moov
// atom to the front so the clip can stream. Opus targets ~24k (voice); AAC 32k.
const TARGETS = [
    { ext: '.webm', args: ['-c:a', 'libopus', '-b:a', '24k'], codec: 'opus' },
    { ext: '.m4a', args: ['-c:a', 'aac', '-b:a', '32k', '-movflags', '+faststart'], codec: 'aac' },
];

// Pure helpers (exported for unit tests). destFor names an output; planConversion
// expands one source mp3 into its per-target build plans.
export function destFor(src, ext) {
    return src.replace(/\.mp3$/, ext);
}

export function planConversion(src) {
    return TARGETS.map((target) => ({ src, dest: destFor(src, target.ext), ...target }));
}

async function collectMp3s(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) files.push(...(await collectMp3s(full)));
        else if (entry.isFile() && entry.name.endsWith('.mp3')) files.push(full);
    }
    return files.sort();
}

// Skip outputs that already exist and are newer than the source, unless forced.
async function needsBuild(src, dest, force) {
    if (force) return true;
    try {
        const [s, d] = await Promise.all([stat(src), stat(dest)]);
        return d.mtimeMs < s.mtimeMs;
    } catch {
        return true; // destination missing
    }
}

async function convert(src, target, dryRun) {
    const dest = destFor(src, target.ext);
    const args = ['-y', '-i', src, ...target.args, dest];
    if (dryRun) return { dest, cmd: `ffmpeg ${args.join(' ')}` };
    await run('ffmpeg', args, { maxBuffer: 16 * 1024 * 1024 });
    return { dest, cmd: null };
}

// Confirm the produced file actually holds the codec we asked for.
async function verify(dest, codec) {
    const { stdout } = await run('ffprobe', [
        '-v', 'error',
        '-select_streams', 'a:0',
        '-show_entries', 'stream=codec_name',
        '-of', 'csv=p=0',
        dest,
    ]);
    return stdout.trim() === codec;
}

export async function main({ dryRun = false, force = false } = {}) {
    try {
        await run('ffmpeg', ['-version']);
    } catch {
        console.error('ffmpeg not found or broken. Fix with: brew reinstall ffmpeg');
        process.exit(1);
    }

    const mp3s = await collectMp3s(AUDIO_ROOT);
    if (mp3s.length === 0) {
        console.error(`No mp3 files found under ${AUDIO_ROOT}`);
        process.exit(1);
    }

    let built = 0;
    let skipped = 0;
    const failures = [];

    for (const src of mp3s) {
        for (const target of TARGETS) {
            if (!(await needsBuild(src, destFor(src, target.ext), force))) {
                skipped++;
                continue;
            }
            try {
                const { dest, cmd } = await convert(src, target, dryRun);
                if (cmd) {
                    console.log(cmd);
                } else if (!(await verify(dest, target.codec))) {
                    failures.push(`${dest}: ffprobe reports wrong codec (expected ${target.codec})`);
                } else {
                    built++;
                    const { size } = await stat(dest);
                    console.log(`${src.replace(AUDIO_ROOT + '/', '')} -> ${dest.split('/').pop()} (${(size / 1024).toFixed(1)} KB)`);
                }
            } catch (err) {
                failures.push(`${src} -> ${target.ext}: ${err.message}`);
            }
        }
    }

    console.log(`\n${built} file(s) converted, ${skipped} up-to-date, ${failures.length} failure(s).`);
    if (failures.length > 0) {
        for (const f of failures) console.error(`  FAIL ${f}`);
        process.exit(1);
    }
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const flags = process.argv.slice(2);
    main({ dryRun: flags.includes('--dry-run'), force: flags.includes('--force') });
}
