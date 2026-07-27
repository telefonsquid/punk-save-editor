/**
 * `bun run lint`'s second half: the design-system rules that no linter knows.
 *
 * docs/design.md has said "no hard-coded colours in components" since the
 * palette was written down, and the components drifted anyway — stock Tailwind
 * zinc greys (the exact cold grey the palette exists to avoid), a cyan that
 * belonged to no palette at all, three private copies of the card slab. A rule
 * that is only prose gets re-broken every time someone is in a hurry, so it is
 * checked here instead.
 *
 * Two rules, both scoped to the UI. `src/routes/layout.css` is where colour
 * literals belong and is exempt; a line that genuinely needs one (sampled
 * artwork, a gradient ramp) says so with a `palette-ok:` comment and a reason.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Files these rules apply to: everything that draws UI, minus the palette itself. */
const ROOTS = ['src/lib/components', 'src/routes'];
const EXEMPT = ['src/routes/layout.css'];

interface Rule {
	name: string;
	pattern: RegExp;
	why: string;
}

const RULES: Rule[] = [
	{
		name: 'stock-tailwind-palette',
		// Tailwind's own colour scales. Every grey in them is cold; the game's are
		// all warm, so the two never sit right beside each other.
		pattern:
			/\b(?:bg|text|border|ring|ring-offset|outline|fill|stroke|decoration|shadow|from|via|to|accent|caret|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
		why: 'use a palette token (--color-*) instead of a stock Tailwind colour'
	},
	{
		name: 'hard-coded-colour',
		// A literal colour outside layout.css is a palette-retune bug waiting to
		// happen: the retune changes the token and this stays behind.
		pattern: /(?:#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\()/,
		why: 'move the colour into a --color-* token in routes/layout.css'
	}
];

/**
 * Waives the line it sits on or the one after it — a trailing comment reads
 * badly on a long declaration, so the marker may also go on the line above.
 * `palette-ok-file:` anywhere in a file waives colour literals throughout it.
 */
const WAIVER = /palette-ok:/;
const FILE_WAIVER = /palette-ok-file:/;

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const path = `${dir}/${entry}`;
		if (statSync(path).isDirectory()) out.push(...walk(path));
		else if (/\.(svelte|css|ts)$/.test(entry)) out.push(path);
	}
	return out;
}

/**
 * Blanks out comments so prose can name a colour without tripping the rule —
 * these files explain which sample a token came from, and a comment cannot
 * retune anything. Handles the three comment syntaxes a `.svelte` file mixes:
 * line comments (but not the slashes in a URL), block comments across lines,
 * and markup comments. Newlines survive so line numbers still line up.
 */
function stripComments(source: string): string[] {
	return source
		.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
		.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
		.split('\n')
		.map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'));
}

let failures = 0;
for (const area of ROOTS) {
	for (const path of walk(`${root}${area}`)) {
		const rel = path.slice(root.length).replaceAll('\\', '/');
		if (EXEMPT.includes(rel)) continue;
		const source = readFileSync(path, 'utf8');
		const waivedFile = FILE_WAIVER.test(source);
		const raw = source.split('\n');
		stripComments(source).forEach((line, i) => {
			if (WAIVER.test(raw[i]) || (i > 0 && WAIVER.test(raw[i - 1]))) return;
			for (const rule of RULES) {
				if (waivedFile && rule.name === 'hard-coded-colour') continue;
				const hit = line.match(rule.pattern);
				if (!hit) continue;
				console.error(`${rel}:${i + 1}  ${rule.name}: "${hit[0]}" — ${rule.why}`);
				failures++;
			}
		});
	}
}

if (failures > 0) {
	console.error(
		`\n${failures} design-system violation${failures === 1 ? '' : 's'}. See docs/design.md.\n` +
			'A colour that really is artwork rather than palette can carry a `palette-ok: <reason>` comment on its line.'
	);
	process.exit(1);
}
console.log('check-style: no design-system violations');
