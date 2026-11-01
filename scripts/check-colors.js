#!/usr/bin/env node
/**
 * Keeps the count of hard-coded colours from growing: each file may have no more than its
 * number in scripts/color-baseline.json. Tokens live in src/index.css, which isn't counted.
 * Run with --update to lower the baseline after clearing colours out of a file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const BASELINE = path.join(HERE, 'color-baseline.json');
const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/g;

function sourceFiles(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(rel);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [rel] : [];
  });
}

const counts = {};
for (const file of sourceFiles('src').sort()) {
  const found = fs.readFileSync(path.join(ROOT, file), 'utf8').match(COLOR);
  if (found) counts[file] = found.length;
}
const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

if (process.argv.includes('--update')) {
  fs.writeFileSync(BASELINE, `${JSON.stringify(counts, null, 2)}\n`);
  console.log(`Baseline updated: ${total} hard-coded colours.`);
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const over = Object.entries(counts).filter(([file, n]) => n > (baseline[file] ?? 0));
if (over.length > 0) {
  for (const [file, n] of over) {
    console.error(`${file}: ${n} hard-coded colours, allowed ${baseline[file] ?? 0}. Use a token instead.`);
  }
  process.exit(1);
}
console.log(`${total} hard-coded colours, none over the baseline.`);
