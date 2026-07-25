/**
 * Prints one release's section of CHANGELOG.md, so the GitHub release body and
 * the app's changelog page say the same thing without either being retyped.
 * Called by .github/workflows/release.yml with the tag name.
 *
 *   bun run release-notes v1.0.0
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { versionHeading } from '../src/lib/changelog-heading';

const wanted = (process.argv[2] ?? '').replace(/^v/, '');
if (!wanted) {
	console.error('usage: bun run release-notes <version>');
	process.exit(1);
}

const lines = readFileSync(join(import.meta.dir, '..', 'CHANGELOG.md'), 'utf8').split(/\r?\n/);
const start = lines.findIndex((line) => versionHeading(line)?.version === wanted);

if (start === -1) {
	console.error(`CHANGELOG.md has no section for ${wanted}`);
	process.exit(1);
}

const rest = lines.slice(start + 1);
const end = rest.findIndex((line) => versionHeading(line) !== null);
const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();

console.log(body);
