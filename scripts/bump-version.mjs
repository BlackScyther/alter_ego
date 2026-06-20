#!/usr/bin/env node
// Increments the patch version in package.json by 1 (e.g. 1.2.4 -> 1.2.5).
// Used by the pre-commit git hook so every commit carries a fresh version.
// Set ALTER_EGO_SKIP_BUMP=1 to skip (e.g. for automated/merge commits).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

if (process.env.ALTER_EGO_SKIP_BUMP === '1') {
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(here, '..', 'package.json');

const raw = readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(raw);

const current = String(pkg.version ?? '0.0.0');
const match = current.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
if (!match) {
  console.error(`bump-version: cannot parse version "${current}"`);
  process.exit(1);
}

const [, major, minor, patch, suffix] = match;
const next = `${major}.${minor}.${Number(patch) + 1}${suffix}`;
pkg.version = next;

// Preserve 2-space indentation and a trailing newline (matches existing file).
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

console.log(`bump-version: ${current} -> ${next}`);
