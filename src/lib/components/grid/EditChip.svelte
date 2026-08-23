<script lang="ts">
	import { sound } from '$lib/sound.svelte';

	// The chip that opens a module's card editor — one affordance worn twice:
	// as a text chip on the canvas's hovered tile and as a pencil on the vault
	// dock's tiles. A deliberate punk-frame subset: at chip size the four-bar
	// frame is more frame than control, so it wears punk-field's plain 2px edge
	// instead, the same trade the boxed CloseBadge beside it makes.
	//
	// `class` takes the caller's positioning, styled through :global the way
	// CloseBadge's is — a scoped class never reaches this element.
	let {
		label,
		text,
		onclick,
		class: klass = ''
	}: {
		/** Names the action, e.g. "Edit DANDELION". */
		label: string;
		/** Renders as a text chip; without it the chip draws the pencil glyph. */
		text?: string;
		onclick: () => void;
		class?: string;
	} = $props();
</script>

<!-- Presses stop here: the chip sits on a control of its own (a tile, the pan
     surface), and a click that fell through would also act on that. -->
<button
	type="button"
	class="edit-chip {text ? 'is-text' : 'is-glyph'} {klass}"
	aria-label={label}
	title={label}
	onpointerdown={(e) => e.stopPropagation()}
	onpointerenter={(e) => {
		if (e.pointerType !== 'touch') sound.play('hover');
	}}
	onclick={(e) => {
		e.stopPropagation();
		sound.play('click');
		onclick();
	}}
>
	{#if text}
		{text}
	{:else}
		<!-- Drawn, like the badge glyphs: a text glyph neither centres nor
		     scales cleanly at this size. -->
		<svg viewBox="0 0 12 12" aria-hidden="true">
			<path d="M1 11v-3l7-7 3 3-7 7H1z" />
		</svg>
	{/if}
</button>

<style>
	.edit-chip {
		pointer-events: auto;
		color: var(--color-ink);
		background-color: var(--color-void);
		border: 2px solid var(--color-edge);
		cursor: pointer;
	}
	.edit-chip:hover {
		border-color: var(--color-accent);
		color: var(--color-accent);
	}

	.is-text {
		padding: var(--u) calc(2 * var(--u)) calc(var(--u) + 1px); /* the extra 1px re-centres the HUD face's low-hanging cap */
		font-family: var(--font-title);
		font-size: var(--text-hud-xs);
		line-height: 1; /* the body's 30px would balloon the chip over its cell */
		letter-spacing: var(--tracking-hud);
		text-transform: uppercase;
	}

	.is-glyph {
		width: 18px;
		height: 18px;
		padding: 3px;
	}
	.is-glyph svg {
		display: block;
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
</style>
