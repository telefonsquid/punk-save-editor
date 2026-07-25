/**
 * Sets the app version everywhere it is written down. Four files have to agree —
 * package.json, tauri.conf.json, Cargo.toml and the lock entry Cargo.toml
 * generates — and a mismatch is not caught until a release build is already
 * halfway through CI, so this does all four at once.
 *
 *   bun run version:set 1.1.0
 *
 * It refuses to run if CHANGELOG.md has no section for the version yet: the
 * release notes on GitHub and the app's changelog page are both read from there,
 * so a version without an entry ships an empty release.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { versionHeading } from '../src/lib/changelog-heading';

const ROOT = join(import.meta.dir, '..');
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
	console.error('usage: bun run version:set <major.minor.patch>');
	process.exit(1);
}

const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

/** Replaces the one match of `pattern` in `file`, or fails loudly. */
function patch(file: string, pattern: RegExp, replacement: string) {
	const before = read(file);
	const after = before.replace(pattern, replacement);
	if (after === before) {
		console.error(`${file}: found nothing to replace (${pattern})`);
		process.exit(1);
	}
	writeFileSync(join(ROOT, file), after);
	console.log(`  ${file}`);
}

const hasSection = read('CHANGELOG.md')
	.split(/\r?\n/)
	.some((line) => versionHeading(line)?.version === version);
if (!hasSection) {
	console.error(`CHANGELOG.md has no "## ${version} — <date>" section yet. Write it first.`);
	process.exit(1);
}

console.log(`Setting version ${version} in:`);
patch('package.json', /"version": "[^"]+"/, `"version": "${version}"`);
patch('src-tauri/tauri.conf.json', /"version": "[^"]+"/, `"version": "${version}"`);
// Only the first `version =` in Cargo.toml belongs to [package]; the dependency
// tables below it must not be touched.
patch('src-tauri/Cargo.toml', /version = "[^"]+"/, `version = "${version}"`);
// The lock file names the package right above its version.
patch(
	'src-tauri/Cargo.lock',
	/(name = "punk-save-editor"\nversion = )"[^"]+"/,
	`$1"${version}"`
);

console.log(`
Next:
  git commit -am "release ${version}"
  git tag v${version}
  git push origin master --tags

CI builds every platform and opens a DRAFT release; review it on GitHub and
publish when the bundles look right.`);
