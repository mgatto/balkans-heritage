#!/usr/bin/env node
// Extracts and prints the RDFa triples embedded in the site's HTML pages so the
// Schema.org / Dublin Core structured data can be eyeballed and diffed locally.
// Usage: node scripts/validate-rdfa.mjs [file ...]   (defaults to src/*.html)

import { RdfaParser } from 'rdfa-streaming-parser';
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'https://balkans-heritage.example/';

async function resolveFiles() {
  const args = process.argv.slice(2);
  if (args.length > 0) return args;
  const entries = await readdir('src', { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.html'))
    .map((e) => join('src', e.name))
    .sort();
}

function extract(file) {
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

    createReadStream(file).pipe(parser);
  });
}

const files = await resolveFiles();
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
