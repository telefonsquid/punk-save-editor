/**
 * Writes a table of download badges into the release notes, GitHub folds most assets of a big release away.
 *
 * Fills the space between <!-- downloads --> and <!-- /downloads --> in the body, or appends it.
 * Called by .github/workflows/release.yml after the assets are renamed, safe to rerun by hand.
 * With --readme the same table goes into README.md instead, version:set moves it along on later releases.
 * Needs GH_TOKEN (or GITHUB_TOKEN) with contents write and GITHUB_REPOSITORY as owner/repo.
 *
 *   bun run release-downloads v1.0.0 [--readme] [--dry-run]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { api, findRelease, repoAccess } from './github';

const SLUG = 'punk-save-editor';

const OPEN = '<!-- downloads -->';
const CLOSE = '<!-- /downloads -->';

/** The accent colour of the app */
const COLOR = 'fe9e20';

/** Shields.io no longer carries the Windows logo, four squares stand in */
const WINDOWS_LOGO = `data:image/svg+xml;base64,${btoa(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fff" d="M0 0h11v11H0zm13 0h11v11H13zM0 13h11v11H0zm13 0h11v11H13z"/></svg>'
)}`;

const SYSTEMS = [
	{ id: 'windows', name: 'Windows', logo: WINDOWS_LOGO },
	{ id: 'mac', name: 'macOS', logo: 'apple' },
	{ id: 'linux', name: 'Linux', logo: 'linux' }
];

const ARCHES = [
	{ id: 'x64', name: 'x64 (Intel, AMD)' },
	{ id: 'arm64', name: 'arm64 (Apple Silicon, Snapdragon)' }
];

/** Name endings after os and arch, in badge order */
const KINDS: [ending: string, label: string][] = [
	['_portable.exe', 'Portable'],
	['_setup.exe', 'Installer'],
	['.msi', 'MSI'],
	['.dmg', 'dmg'],
	['.AppImage', 'AppImage'],
	['.deb', 'deb'],
	['.rpm', 'rpm']
];

function badge(label: string, logo: string, alt: string, url: string): string {
	const src = `https://img.shields.io/badge/${encodeURIComponent(label)}-${COLOR}?logo=${encodeURIComponent(logo)}&logoColor=white`;
	return `[![${alt}](${src})](${url})`;
}

/** Markdown table with one badge per file, only for files the release really has */
export function downloadSection(names: string[], repo: string, tag: string, heading = '###'): string | null {
	const version = tag.replace(/^v/, '');
	const present = new Set(names);

	const rows = SYSTEMS.map((os) => {
		const cells = ARCHES.map((arch) =>
			KINDS.map(([ending, label]) => [`${SLUG}_${version}_${os.id}_${arch.id}${ending}`, label])
				.filter(([name]) => present.has(name))
				.map(([name, label]) =>
					badge(label, os.logo, `${os.name} ${arch.id} ${label}`, `https://github.com/${repo}/releases/download/${tag}/${name}`)
				)
				.join(' ')
		);
		return cells.some(Boolean) ? `| **${os.name}** | ${cells.map((c) => c || '–').join(' | ')} |` : null;
	}).filter((row) => row !== null);
	if (!rows.length) return null;

	const head = `| | ${ARCHES.map((a) => a.name).join(' | ')} |`;
	const rule = `| :-- | ${ARCHES.map(() => ':--').join(' | ')} |`;
	return [OPEN, '', `${heading} Download`, '', head, rule, ...rows, '', CLOSE].join('\n');
}

/** Replaces an earlier table, so reruns never stack them */
export function withDownloads(body: string, section: string): string {
	const start = body.indexOf(OPEN);
	const end = body.indexOf(CLOSE, start);
	if (start < 0 || end < 0) return `${body.trimEnd()}\n\n${section}\n`;
	return body.slice(0, start) + section + body.slice(end + CLOSE.length);
}

async function main(): Promise<number> {
	const [, , tag = '', ...flags] = process.argv;
	const dryRun = flags.includes('--dry-run');
	const readme = flags.includes('--readme');
	if (!tag) {
		console.error('usage: bun run release-downloads <tag> [--readme] [--dry-run]');
		return 1;
	}

	const access = repoAccess();
	if (!access) {
		console.error('GITHUB_REPOSITORY and GH_TOKEN (or GITHUB_TOKEN) must be set');
		return 1;
	}
	const { repo, token } = access;

	const release = await findRelease(token, repo, tag);
	if (!release) {
		console.log(`no release for ${tag}, nothing to link`);
		return 0;
	}

	const section = downloadSection(release.assets.map((a) => a.name), repo, tag, readme ? '##' : '###');
	if (!section) {
		console.log(`no asset on ${tag} has a known name, notes left as they are`);
		return 0;
	}

	if (readme) {
		const file = join(import.meta.dir, '..', 'README.md');
		const before = readFileSync(file, 'utf8');
		const after = withDownloads(before, section.replaceAll('\n', before.includes('\r\n') ? '\r\n' : '\n'));
		if (dryRun) console.log(after);
		else writeFileSync(file, after);
		console.log(`download table of ${tag} written into README.md`);
		return 0;
	}

	const body = withDownloads(release.body ?? '', section);
	if (dryRun) {
		console.log(body);
		return 0;
	}

	await api(token, `/repos/${repo}/releases/${release.id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ tag_name: tag, body }) // Drafts drop their tag on edits without it
	});
	console.log(`download table written into the notes of ${tag}`);
	return 0;
}

if (import.meta.main) process.exit(await main());
