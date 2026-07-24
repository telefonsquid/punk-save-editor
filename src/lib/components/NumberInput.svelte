<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	// The one place that defines what an editable number field looks like.
	// `class` sets the width (default w-24; the Cores field passes w-16).
	//
	// number_input.png and its hover/click siblings: a tight box with the value
	// centred in it, quiet until you reach for it. It wears the same `punk-frame`
	// as Button — uneven bars, open corners — because in the game it is the same
	// box. Same three states too (idle, orange outline under the pointer, white
	// outline while active), so the whole editor answers the pointer the same way.
	// Only the outline ever changes colour; the value holds its own.
	//
	// Unlike buttons, the game sets the VALUE in 8-bit HUD, not 000webfont (read
	// off number_input.png). That face centres cleanly in its own box, so this
	// field just pins a height and lets line-height place the digits — no cap-fix.
	// number_input.png is a 4x capture (4px = one game pixel): the frame is 14u
	// tall around a digit a little under 5u, which is 8-bit HUD at its small size.
	let { class: klass = 'w-24', ...rest }: HTMLInputAttributes = $props();
</script>

<input type="number" class="punk-num punk-frame text-center {klass}" {...rest} />

<style>
	.punk-num {
		/* Fill the body, leave the frame's cut corners transparent. @tailwindcss/forms
		   paints inputs solid white by default, which would show through the four cut
		   corners the fill layer stops short of — so the element's own background has
		   to be cleared and the body colour drawn as the frame's inset fill instead. */
		background-color: transparent;
		--frame-fill: var(--color-void);
		--frame: var(--color-edge-dim);

		font-family: var(--font-title);
		font-size: var(--text-hud-xs);
		/* 8-bit HUD is not the self-spacing face 000webfont is, so the body's
		   negative letter-spacing would blur it. Reset to the font's own metrics. */
		letter-spacing: normal;
		color: var(--color-muted);
		/* @tailwindcss/forms gives every input a 1px border. Here that border is
		   a closed rectangle drawn straight over the four corners punk-frame just
		   cut open, so it has to go. */
		border: 0;
		/* Pin the box to the reference's 14u and let a full-height line-height sit
		   the centred digits in the middle of it. */
		height: calc(14 * var(--u));
		line-height: calc(14 * var(--u));
		/* 8-bit HUD's box sits a hair low against this browser's line metrics; a
		   single game pixel of bottom padding lifts the digits back to centre. */
		padding-block: 0 var(--u);
		padding-inline: calc(3 * var(--u));
		transition: none;
	}

	/* Hover recolours only the outline — the value holds its colour. */
	.punk-num:hover:not(:disabled) {
		--frame: var(--color-accent);
	}

	/* Editing brightens only the outline to white — the value keeps its colour. */
	.punk-num:focus {
		--frame: var(--color-ink);
		outline: none;
	}

	/* Spinner arrows are vector chrome the browser draws at whatever size it
	   likes — there is no way to make them pixel art, so they go. */
	.punk-num::-webkit-outer-spin-button,
	.punk-num::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}

	.punk-num {
		appearance: textfield;
		-moz-appearance: textfield;
	}
</style>
