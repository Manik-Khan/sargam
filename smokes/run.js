// smokes/run.js — Sargam smoke runner.
// Imports every smokes/*.smoke.js, runs each { name, fn } sequentially,
// prints PASS/FAIL per smoke and a summary line, exits 1 on any failure.

import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);

const files = (await readdir(here))
  .filter((f) => f.endsWith('.smoke.js'))
  .sort();

let passed = 0;
let failed = 0;

for (const file of files) {
  const mod = await import(pathToFileURL(path.join(here, file)).href);
  const smokes = mod.smokes;
  if (!Array.isArray(smokes)) {
    console.error(`FAIL ${file}: does not export a smokes array`);
    failed++;
    continue;
  }
  for (const { name, fn } of smokes) {
    try {
      await fn();
      console.log(`PASS ${name}`);
      passed++;
    } catch (err) {
      console.error(`FAIL ${name}`);
      console.error(`     ${err && err.message ? err.message.split('\n').join('\n     ') : err}`);
      failed++;
    }
  }
}

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
