# Plan: Complete & harden Schema.org / RDFa structured data

**Status:** Largely complete — vocab/prefix, coordinates, attribution modeling, and Wikidata/DBpedia `sameAs` landed 2026-08-13. Remaining: two unverified image-source URLs; DRY refactor deferred by decision.
**Scope:** `src/*.html`
**Related:** README section "Structured data (Schema.org)"

## Background

The point-of-interest pages annotate their content with [Schema.org](https://schema.org/) vocabulary via inline [RDFa](https://www.w3.org/TR/rdfa-primer/) attributes (`vocab`, `typeof`, `property`). The intent is to expose each landmark as machine-readable data (SEO, rich results, map/knowledge-graph consumers). The markup is currently incomplete and inconsistent across pages, so much of it will not resolve to real Schema.org / Dublin Core terms.

## Current state (audit)

Per-page audit of the RDFa scaffolding as it stands today:

Original audit (pre-2026-08-13) with current status noted in the last column:

| Page | `vocab` on `<body>` | `dc:` prefix declared | `TouristAttraction` `<main>` | `GeoCoordinates` filled | Status (2026-08-13) |
| --- | --- | --- | --- | --- | --- |
| `src/index.html` | no (`<body id="home">`) | no | no | n/a | Unchanged — home page is not a landmark; only a stray `dc:source` on an attribution. |
| `src/bridge.html` | **yes** | now **yes** | yes | yes (lat/long set) | ✅ `dc:` prefix added; consolidated three overlapping geo blocks (RDFa `<data value>`, duplicate Microdata `<meta itemprop>`, dead comment) into one RDFa block; empty `<figcaption property="">` removed. |
| `src/mosque.html` | now **yes** | now **yes** | yes | yes (lat/long set) | ✅ `vocab` + `dc:` prefix added; `<meta>` → `<span content>`; fixed `<!DOCTYPE>` casing. |
| `src/fountain.html` | now **yes** | now **yes** | yes | yes (lat/long set) | ✅ `vocab` + `dc:` prefix added; `<meta>` → `<span content>`. |
| `src/monastery.html` | now **yes** | now **yes** | yes | now **yes** | ✅ `vocab` + `dc:` prefix added; coordinates filled (`43.25698, 17.90302`, via [Wikidata Q43951226](https://www.wikidata.org/wiki/Q43951226)); `<meta>` → `<span content>`; empty `<figcaption property="">` removed. |

### Key issues

1. ✅ **[Resolved 2026-08-13] Missing `vocab` declaration.** `vocab="http://schema.org/"` is now on `<body>` of all four landmark pages.
2. ✅ **[Resolved 2026-08-13] Missing Dublin Core `prefix`.** `prefix="dc: http://purl.org/dc/terms/"` is now declared on `<body>` of all four landmark pages, so `dc:source`, `dc:creator`, and `dc:license` resolve.
3. ✅ **[Resolved 2026-08-13] Empty / placeholder attributes.** `monastery.html` coordinates are populated; the empty `<figcaption property="">` placeholders on `bridge.html` and `monastery.html` are removed.
4. ✅ **[Resolved 2026-08-13] Inconsistent image/attribution modeling.** The hero image is now a nested [`ImageObject`](https://schema.org/ImageObject) (`<figure property="photo" typeof="ImageObject">`) carrying `contentUrl`, `creator`, `copyrightHolder`, `license` (as the CC URL), and — where verified — `dc:source`, so attribution attaches to the **image** rather than the landmark. Quotation/source attribution is now a distinct `schema:subjectOf` → `CreativeWork` with `publisher`, no longer overloading `dc:source`. The empty `href=""` links that resolved to the page URL had their `property` removed so they no longer emit a false triple.

## Proposed work

1. ✅ **[Done 2026-08-13] Standardize the vocabulary declaration.** `vocab="http://schema.org/"` added to `<body>` on `mosque.html`, `fountain.html`, and `monastery.html` to match `bridge.html`. Canonical location: `<body>`.
2. ✅ **[Done 2026-08-13] Declare the Dublin Core prefix.** `prefix="dc: http://purl.org/dc/terms/"` added to `<body>` on all four landmark pages.
3. ✅ **[Done 2026-08-13] Fill in missing data.** `monastery.html` latitude/longitude populated (via [Wikidata Q43951226](https://www.wikidata.org/wiki/Q43951226)); empty `property=""` on `<figcaption>` elements removed. Also converted every `GeoCoordinates` `<meta property>` to an empty `<span property … content …>` so the markup validates as body content while preserving the RDFa literal.
4. ✅ **[Done 2026-08-13] Model attribution more precisely.** Hero images modeled as nested `ImageObject` (`creator`, `copyrightHolder`, `license`, `contentUrl`, and `dc:source` where verified); quotation attribution moved to `schema:subjectOf` → `CreativeWork` with `publisher`. **Still outstanding:** the image-source `<a href="">` links on `mosque.html` and `monastery.html` could not be verified on Wikimedia Commons (no file credits "Dinozzza"; only a ceilings shot credits "Talha Şamil Çakır", not the exterior view used). Their `dc:source` `property` was removed to avoid a false triple — find the real Commons file pages and restore `dc:source`. `fountain.html` uses [File:Fontaine_Sebilj.jpg](https://commons.wikimedia.org/wiki/File:Fontaine_Sebilj.jpg); `bridge.html` retains its existing verified source.
5. ⏸️ **[Deferred 2026-08-13] Consider a shared approach.** Decision: keep as a future design note; do **not** introduce a template/partial or build step now, to preserve the framework-free, static-HTML approach. Revisit if the number of landmark pages grows enough that the repeated RDFa scaffolding becomes a maintenance burden.

## Linked data (`sameAs`)

Each landmark now links to its authoritative entities via `schema:sameAs` (invisible `<span property="sameAs" resource="…">`), delivering the "graph node" payoff — a consumer can traverse from the page into global datasets:

| Page | Wikidata | DBpedia |
| --- | --- | --- |
| `bridge.html` | [`Q6085799`](http://www.wikidata.org/entity/Q6085799) | `Old_Stone_Bridge,_Prizren` |
| `mosque.html` | [`Q1255835`](http://www.wikidata.org/entity/Q1255835) | `Gazi_Husrev-beg_Mosque` |
| `fountain.html` | [`Q1062192`](http://www.wikidata.org/entity/Q1062192) | `Sebilj_in_Sarajevo` |
| `monastery.html` | [`Q43951226`](http://www.wikidata.org/entity/Q43951226) | — (no standalone English Wikipedia article) |

## Validation

- Run the existing HTML validator: `npm run lint:html`. All four landmark pages currently pass with zero errors.
- Verify extracted structured data with an RDFa-aware tool, e.g. the [Google Rich Results Test](https://search.google.com/test/rich-results), the [Schema Markup Validator](https://validator.schema.org/), or the [W3C RDFa Play / distiller](https://rdfa.info/play/), and confirm each landmark surfaces as a `TouristAttraction` with resolved `GeoCoordinates` and attribution.
- For a local/CI check, run `npm run validate:rdfa` (script at `scripts/validate-rdfa.mjs`, backed by [`rdfa-streaming-parser`](https://www.npmjs.com/package/rdfa-streaming-parser)). It prints the extracted triples for every `src/*.html` page. A 2026-08-13 run confirmed each landmark emits `schema:TouristAttraction` + `schema:GeoCoordinates` (resolved `latitude`/`longitude`), `schema:sameAs` to Wikidata/DBpedia, a `schema:photo` → `ImageObject` with its own attribution, and a `schema:subjectOf` → `CreativeWork` for the quotation source.

## Out of scope

- Redesigning page content or copy.
- Adding new points of interest (Parts II–IV of the tour).
