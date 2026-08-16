#!/usr/bin/env node
// Extracts and prints the RDFa triples embedded in the site's HTML pages so the
// Schema.org / Dublin Core structured data can be eyeballed and diffed locally.
// Usage: node scripts/validate-rdfa.mjs [file ...]   (defaults to src/*.html)

import { RdfaParser } from 'rdfa-streaming-parser';
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = 'https://balkans-heritage.example/';

export async function resolveFiles(args = process.argv.slice(2)) {
  if (args.length > 0) return args;
  const entries = await readdir('src', { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.html'))
    .map((e) => join('src', e.name))
    .sort();
}

export function extract(file) {
  return new Promise((resolve, reject) => {
    const baseIRI = BASE + file.split('/').pop();
    const parser = new RdfaParser({ baseIRI, contentType: 'text/html' });
    const triples = [];

    parser
      .on('data', (q) => {
        const o =
          q.object.termType === 'Literal'
            ? `"${q.object.value.replace(/\s+/g, ' ').trim()}"`
            : `<${q.object.value}>`;
        triples.push(`  <${q.subject.value}>  <${q.predicate.value}>  ${o}`);
      })
      .on('error', reject)
      .on('end', () => resolve(triples));

    // Also reject on read-stream errors (e.g. a missing file), not just parser
    // errors — otherwise those surface as an unhandled 'error' event instead
    // of a clean rejection.
    createReadStream(file).on('error', reject).pipe(parser);
  });
}

export async function run(args) {
  const files = await resolveFiles(args);
  let total = 0;

  for (const file of files) {
    try {
      const triples = await extract(file);
      total += triples.length;
      console.log(`\n=== ${file} : ${triples.length} triples ===`);
      for (const t of triples) console.log(t);
    } catch (err) {
      console.error(`\n=== ${file} : PARSE ERROR ===\n  ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.log(`\n${files.length} file(s), ${total} triples total.`);
}

// Only run the CLI when this file is executed directly (`node scripts/validate-rdfa.mjs`),
// not when imported by tests. Guarded against a missing argv[1] (e.g. `node -e`).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run(process.argv.slice(2));
}
