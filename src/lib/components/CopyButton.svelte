<script lang="ts">
	import { copyText } from '$lib/clipboard';
	import { sound } from '$lib/sound.svelte';

	// A glyph that copies a line of text — a save path on the title screen — to
	// the clipboard. Same family as CloseBadge: no frame, the glyph is the whole
	// control, quiet until the pointer reaches it.
	//
	// The glyph is drawn pixel by pixel on the game's own terms (whole pixels,
	// square corners, integer scale via `--u`) rather than borrowed from an icon
	// set, because it sits in a line of 000webfont and a vector icon beside a
	// pixel face reads as pasted in.
	//
	// A copy leaves nothing on screen to show it worked, so this is the one place
	// the control answers a success: the sheets turn into a tick, in the
	// interaction colour, for as long as it takes to see it.

	const HOLD = 1400;

	let {
		text,
		/** Names the action, e.g. "Copy the Windows save path". */
		label
	}: { text: string; label: string } = $props();

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => () => clearTimeout(timer));

	async function copy() {
		try {
			await copyText(text);
		} catch {
			// Nothing to say: the tick simply does not appear.
			return;
		}
		sound.play('click');
		copied = true;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), HOLD);
	}
</script>

<button
	type="button"
	class="copy-button"
	class:is-copied={copied}
	aria-label={label}
	title={copied ? 'Copied' : label}
	onclick={copy}
	onpointerenter={(e) => {
		if (e.pointerType !== 'touch') sound.play('hover');
	}}
>
	<!-- Seven by eight game pixels. Two sheets, the front one hiding the corner of
	     the one behind; the tick is a two-pixel stair. -->
	<svg viewBox="0 0 7 8" aria-hidden="true">
		{#if copied}
			<path d="M0 3h1v2H0zM1 4h1v2H1zM2 5h1v2H2zM3 4h1v2H3zM4 3h1v2H4zM5 2h1v2H5zM6 1h1v2H6z" />
		{:else}
			<path d="M0 0h5v1H0zM0 1h1v5H0zM4 1h1v1H4zM1 5h1v1H1z" />
			<path d="M2 2h5v1H2zM2 7h5v1H2zM2 3h1v4H2zM6 3h1v4H6z" />
		{/if}
	</svg>
	<!-- Announced, since the tick is the only other sign anything happened. -->
	<span class="sr-only" role="status">{copied ? 'Copied' : ''}</span>
</button>

<style>
	/* 2px game pixels: the glyph comes out 14 x 16, a touch taller than the
	   capitals it sits beside, which is what a glyph needs to read as a control
	   and not a stray mark. The padding widens the target without widening the
	   ink. */
	.copy-button {
		--u: 2px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		margin: -4px;
		border: 0;
		background: transparent;
		color: var(--color-muted);
		cursor: pointer;
		transition: none;
		/* Beside a line of 000webfont, whose capitals hang low — see --cap-drop. */
		transform: translateY(var(--cap-drop));
	}

	.copy-button svg {
		width: calc(7 * var(--u));
		height: calc(8 * var(--u));
		fill: currentColor;
		shape-rendering: crispEdges;
	}

	.copy-button:hover,
	.copy-button.is-copied {
		color: var(--color-accent);
	}

	.copy-button:active {
		color: var(--color-ink);
	}

	.copy-button:focus-visible {
		outline: var(--u) solid var(--color-accent);
		outline-offset: 0;
	}
</style>
