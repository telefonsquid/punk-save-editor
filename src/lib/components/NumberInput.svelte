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

<input type="number" class="punk-num punk-frame punk-hud-num text-center {klass}" {...rest} />

<style>
	.punk-num {
		/* punk-hud-num clears the element's own background, which matters here:
		   a solid fill would show through the four cut corners punk-frame leaves
		   open, so the body colour is drawn as the frame's inset fill instead. */
		--frame-fill: var(--color-void);
		--frame: var(--color-edge-dim);

		font-size: 14px;
		color: var(--color-muted);
		/* Pin the box to the reference's 14u and let a full-height line-height sit
		   the centred digits in the middle of it. */
		height: calc(14 * var(--u));
		line-height: calc(14 * var(--u));
		/* 8-bit HUD's box sits a hair low against this browser's line metrics; a
		   single game pixel of bottom padding lifts the digits back to centre. */
		padding-block: 0 var(--u);
		padding-inline: calc(3 * var(--u));
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
</style>
