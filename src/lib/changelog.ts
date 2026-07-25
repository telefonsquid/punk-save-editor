/**
 * The changelog page reads CHANGELOG.md itself rather than repeating it, so the
 * release notes on GitHub and the ones in the app can never drift apart. Vite
 * inlines the file at build time (`?raw`), which is also what keeps this working
 * in the desktop app, where there is no server to fetch it from.
 *
 * The format is documented at the top of CHANGELOG.md. Anything this parser does
 * not recognise is kept as a paragraph rather than dropped, so an unusual entry
 * still shows up.
 */

import source from '../../CHANGELOG.md?raw';
import { versionHeading } from './changelog-heading';

export interface InlinePart {
	text: string;
	/** True for `backticked` spans, which render as the game's file-name grey. */
	code: boolean;
}

export interface ChangeGroup {
	/** "Added", "Fixed", … or null for bullets written straight under the version. */
	title: string | null;
	items: InlinePart[][];
}

export interface Release {
	version: string;
	date: string | null;
	/** Prose between the version heading and the first group. */
	intro: InlinePart[][];
	groups: ChangeGroup[];
}

/** Splits `a `b` c` into alternating plain and code parts. */
function inline(text: string): InlinePart[] {
	return text
		.split('`')
		.map((part, i) => ({ text: part, code: i % 2 === 1 }))
		.filter((part) => part.text !== '');
}

/**
 * Wrapped bullets and paragraphs are joined back onto one line: the source is
 * hard-wrapped for reading as a file, and the browser does its own wrapping.
 */
function paragraphs(lines: string[]): string[] {
	const out: string[] = [];
	for (const line of lines) {
		const bullet = line.match(/^\s*[-*]\s+(.*)$/);
		if (bullet) out.push(bullet[1]);
		else if (line.trim() === '') out.push('');
		else if (out.length === 0 || out[out.length - 1] === '') out.push(line.trim());
		else out[out.length - 1] += ' ' + line.trim();
	}
	return out.filter((p) => p !== '');
}

function parse(markdown: string): Release[] {
	const releases: Release[] = [];
	let release: Release | null = null;
	let group: ChangeGroup | null = null;
	let buffer: string[] = [];

	// Bullets and prose accumulate until the next heading tells us what they
	// belonged to.
	const flush = () => {
		const parsed = paragraphs(buffer).map(inline);
		buffer = [];
		if (!release) return;
		if (group) group.items.push(...parsed);
		else release.intro.push(...parsed);
	};

	for (const line of markdown.split(/\r?\n/)) {
		const version = versionHeading(line);
		const heading = line.match(/^###\s+(.*)$/);
		if (version) {
			flush();
			group = null;
			release = {
				version: version.version,
				date: version.date,
				intro: [],
				groups: []
			};
			releases.push(release);
		} else if (heading && release) {
			flush();
			group = { title: heading[1].trim(), items: [] };
			release.groups.push(group);
		} else if (!line.startsWith('#')) {
			buffer.push(line);
		}
	}
	flush();
	return releases;
}

export const releases: Release[] = parse(source);
