// Cloudflare Worker entry — exists solely to serve byte-range (206 Partial
// Content) responses for the pronunciation audio clips under /assets/audio/.
//
// Why this file exists: Cloudflare Workers Static Assets never honors Range
// requests — it always returns 200 with the full body, for any asset, no
// matter what Cache-Control/Accept-Ranges headers are set (verified against
// production and `wrangler dev`). Safari's <audio> controls require a 206
// answer to their `Range: bytes=0-1` probe, otherwise the clip duration
// renders as "0:00" (Chrome/Firefox don't require this). Only requests
// matching wrangler.jsonc's `assets.run_worker_first` (i.e. /assets/audio/*)
// ever reach this Worker; every other path is served straight from assets.
//
// Two _headers consequences (Cloudflare documented behavior):
//   * Custom _headers rules do NOT apply to responses that pass through a
//     Worker, so the audio cache policy is set here, not in src/public/_headers.
//   * A Worker-returned 206 is never stored by Workers Caching — fine at ~5 KB
//     per clip; the underlying asset fetch is served from the colo's storage.

const AUDIO_CACHE_CONTROL = 'public, max-age=31536000, no-transform';

// Cloudflare's static-assets MIME mapping is purely extension-based and
// labels .webm as video/webm even for these audio-only clips, while the
// glossary markup declares audio/* on its <source> elements. Normalize the
// served Content-Type so the two agree (and so Safari's source selection
// never sees a video/* type on an <audio> element).
const AUDIO_CONTENT_TYPES = new Map([
    ['.webm', 'audio/webm'],
    ['.m4a', 'audio/mp4'],
    ['.mp3', 'audio/mpeg'],
]);

// Maps the request path's extension to the normalized audio Content-Type,
// or undefined to leave the platform's own type untouched.
function normalizedContentType(pathname) {
    const match = /\.[a-z0-9]+$/i.exec(pathname);
    if (match === null) return undefined;
    return AUDIO_CONTENT_TYPES.get(match[0].toLowerCase());
}

// Parses a single HTTP byte-range (`bytes=0-1`, `bytes=100-`, `bytes=-500`)
// against a known representation size. Returns the inclusive {start, end} to
// serve with 206; 'unsatisfiable' for syntactically valid ranges outside the
// representation (serve 416); or null when the header is absent/unsupported
// (e.g. multi-range) — RFC 9110 §14.2 permits ignoring Range and serving 200.
function parseRangeHeader(header, size) {
    if (header === null) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (match === null || (match[1] === '' && match[2] === '')) return null;

    let start;
    let end;
    if (match[1] === '') {
        // Suffix range: the last N bytes of the representation.
        const suffixLength = Number(match[2]);
        if (suffixLength === 0) return 'unsatisfiable';
        start = Math.max(size - suffixLength, 0);
        end = size - 1;
    } else {
        start = Number(match[1]);
        end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
    }

    if (start > end || start >= size) return 'unsatisfiable';
    return { start, end };
}

// Clones the asset response headers and applies the audio cache policy.
// (The clips are copied verbatim from src/public/ — stable, non-fingerprinted
// URLs. A year of caching is safe because they are fixed vocabulary
// pronunciations; rename the file to bust the cache if one is re-recorded.)
function audioHeaders(headersInit) {
    const headers = new Headers(headersInit);
    headers.set('Cache-Control', AUDIO_CACHE_CONTROL);
    headers.set('Accept-Ranges', 'bytes');
    return headers;
}

export default {
    async fetch(request, env) {
        const assetResponse = await env.ASSETS.fetch(request);

        // Missing files (the not_found_handling 404-page response), redirects,
        // and other non-OK statuses: leave the platform's response — and its
        // caching behavior — untouched. In particular, never stamp the
        // year-long audio Cache-Control onto a 404.
        if (!assetResponse.ok) return assetResponse;

        const headers = audioHeaders(assetResponse.headers);
        const contentType = normalizedContentType(new URL(request.url).pathname);
        if (contentType !== undefined) headers.set('Content-Type', contentType);
        const rangeHeader = request.headers.get('Range');
        const ifRange = request.headers.get('If-Range');

        // A stale If-Range validator downgrades the request to a full 200
        // (RFC 9110 §13.1.5), as does any non-GET method (HEAD included).
        const mayRange =
            request.method === 'GET' &&
            rangeHeader !== null &&
            (ifRange === null || ifRange === assetResponse.headers.get('ETag'));

        if (!mayRange) {
            return new Response(assetResponse.body, {
                status: assetResponse.status,
                statusText: assetResponse.statusText,
                headers,
            });
        }

        const body = await assetResponse.arrayBuffer();
        const size = body.byteLength;
        const range = parseRangeHeader(rangeHeader, size);

        if (range === 'unsatisfiable') {
            headers.set('Content-Range', `bytes */${size}`);
            return new Response(null, { status: 416, headers });
        }

        if (range === null) {
            return new Response(body, { status: 200, headers });
        }

        const { start, end } = range;
        const slice = body.slice(start, end + 1);
        headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
        headers.set('Content-Length', String(slice.byteLength));
        return new Response(slice, { status: 206, headers });
    },
};
