/**
 * A small parser for the TextMesh Pro rich text the game writes into module
 * descriptions and stat lines.
 *
 * Module descriptions are authored with markup — `slowly regenerates
 * <color=#B32AAC>GEL</color>` — and the colours are meaningful: they are the
 * resource colours, so the tag is how the player sees at a glance which
 * resource a module touches. Printing the raw string leaks the markup; stripping
 * it loses the meaning. So the editor parses it.
 *
 * It is deliberately built as a *tag table* rather than a set of regex
 * replacements: the game is in active development and updates will add tags we
 * have not seen. The rules that follow from that:
 *
 * - A tag the table doesn't know is **consumed, not printed** — same as TMP,
 *   which swallows markup it can't parse. New markup degrades to plain text
 *   instead of showing `<size=120%>` to the player.
 * - Adding support for a tag means one entry in TAGS, nothing else.
 * - Anything that isn't a tag is passed through verbatim, so text that merely
 *   contains a `<` survives.
 *
 * The output is a flat run list rather than a tree because every tag TMP allows
 * here is inline styling; a stack of active styles reproduces it exactly and
 * keeps the renderer a single `{#each}`.
 */

export interface TextRun {
	text: string;
	color?: string;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strike?: boolean;
	/** A line break; `text` is empty. */
	newline?: boolean;
	/** Horizontal spacing in em, from `<space=1em>`. */
	space?: number;
}

type Style = Omit<TextRun, 'text' | 'newline' | 'space'>;

/**
 * Known TMP tags. `style` returns the style change a tag applies (the value is
 * whatever followed `=`); `void` tags stand alone and emit a run of their own.
 */
const TAGS: Record<
	string,
	{ style?: (value: string) => Style; void?: (value: string) => TextRun | null }
> = {
	color: { style: (v) => ({ color: normalizeColor(v) }) },
	b: { style: () => ({ bold: true }) },
	i: { style: () => ({ italic: true }) },
	u: { style: () => ({ underline: true }) },
	s: { style: () => ({ strike: true }) },
	br: { void: () => ({ text: '', newline: true }) },
	space: { void: (v) => ({ text: '', space: parseFloat(v) || 0 }) }
};

/** TMP accepts `#rgb`, `#rrggbb`, `#rrggbbaa` and a few names; CSS accepts all. */
function normalizeColor(value: string): string | undefined {
	const v = value.trim().replace(/^["']|["']$/g, '');
	return v || undefined;
}

export function parseRichText(source: string | null | undefined): TextRun[] {
	if (!source) return [];
	const runs: TextRun[] = [];
	const stack: { name: string; style: Style }[] = [];

	// The style in effect: later tags win over earlier ones for the same field.
	const current = (): Style => Object.assign({}, ...stack.map((s) => s.style));

	const pushText = (text: string) => {
		if (!text) return;
		// Authored descriptions use real newlines; keep them as explicit breaks so
		// the renderer doesn't depend on white-space CSS.
		const lines = text.split('\n');
		lines.forEach((line, i) => {
			if (i > 0) runs.push({ text: '', newline: true });
			if (line) runs.push({ text: line, ...current() });
		});
	};

	const tagPattern = /<(\/?)([a-zA-Z-]+)(?:=([^>]*))?>/g;
	let last = 0;
	for (const match of source.matchAll(tagPattern)) {
		pushText(source.slice(last, match.index));
		last = match.index + match[0].length;
		const [, closing, rawName, value = ''] = match;
		const name = rawName.toLowerCase();
		const tag = TAGS[name];
		if (!tag) continue; // unknown markup: swallowed, like TMP does
		if (closing) {
			// Close the most recent matching tag; ignore a stray closer.
			for (let i = stack.length - 1; i >= 0; i--) {
				if (stack[i].name === name) {
					stack.splice(i, 1);
					break;
				}
			}
		} else if (tag.void) {
			const run = tag.void(value);
			if (run) runs.push(run);
		} else if (tag.style) {
			stack.push({ name, style: tag.style(value) });
		}
	}
	pushText(source.slice(last));
	return runs;
}
