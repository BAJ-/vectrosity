// Fails if a core package imports something it shouldn't.
// Rules for every file under packages/*/src:
//   1. Never import React, Electron, Node built-ins or an app package.
//   2. Only import packages listed in that package's own "dependencies".
//   3. Test files (*.test.ts) and test helpers (src/testing/**) may also import vitest and fast-check.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const banned = [
  /^react(\/|$)/,
  /^react-dom(\/|$)/,
  /^electron(\/|$)/,
  /^node:/,
  /^@vcore\/(font-app|draw-app)$/,
];
const testOnly = new Set(['vitest', 'fast-check']);
const importRe =
  /(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;

const filesIn = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? filesIn(full) : /\.tsx?$/.test(name) ? [full] : [];
  });

const packageName = (spec) =>
  spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];

const problems = [];
const packagesDir = join(root, 'packages');
for (const pkg of readdirSync(packagesDir)) {
  const manifest = JSON.parse(readFileSync(join(packagesDir, pkg, 'package.json'), 'utf8'));
  const allowed = new Set(Object.keys(manifest.dependencies ?? {}));
  for (const file of filesIn(join(packagesDir, pkg, 'src'))) {
    const source = readFileSync(file, 'utf8');
    const isTest = /\.test\.tsx?$/.test(file) || /[\\/]src[\\/]testing[\\/]/.test(file);
    for (const match of source.matchAll(importRe)) {
      const spec = match[1] ?? match[2] ?? match[3];
      if (!spec || spec.startsWith('.')) continue;
      const where = relative(root, file);
      if (banned.some((re) => re.test(spec))) {
        problems.push(`${where}: "${spec}" is never allowed in core code`);
      } else if (!allowed.has(packageName(spec)) && !(isTest && testOnly.has(packageName(spec)))) {
        problems.push(`${where}: "${spec}" is not in ${manifest.name}'s dependencies`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`Core import check failed:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('Core import check passed.');
