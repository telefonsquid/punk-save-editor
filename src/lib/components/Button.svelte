<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	// The one place that defines what editor buttons look like (the grid
	// connection toggles are the deliberate exception — they're stateful
	// pressed/unpressed cells, not buttons in this sense).
	//
	// Modelled pixel-for-pixel on button.png / button_hover.png /
	// button_pressed.png. Two things about the game's button are not decorative
	// and are what make it read as PUNK's rather than as a generic pixel box:
	//
	//   1. The frame is UNEVEN. Top, left and right are one game pixel; the
	//      bottom is two. It sits on its bottom edge like a physical key.
	//   2. Every corner pixel is MISSING. The edges stop one pixel short of each
	//      other, so the four corners are open.
	//
	// A plain `border` can express neither, so the frame is drawn as four
	// background bars by the shared `punk-frame` utility in routes/layout.css —
	// the number field wears the same box.
	//
	// Colour never carries meaning: the game has no green "go" or red "stop"
	// button anywhere, so the variants differ only in how loud they are.
	const VARIANTS = {
		/** The default: hairline frame, orange on hover. */
		outline: 'punk-btn-outline',
		/** The main call to action — reads brighter at rest, same hover. */
		primary: 'punk-btn-primary',
		/** Neutral chrome (Close) — stays quiet, never takes the accent. */
		ghost: 'punk-btn-ghost',
		/** Destructive (Remove) — dim until you reach for it, then red. */
		danger: 'punk-btn-danger'
	};

	// The game's buttons are wide slabs with the label floated in the middle, and
	// the reference is roomier than anything Tailwind's scale offers by default:
	// the label occupies about a third of the box. Padding is expressed in game
	// pixels (`--u`) so it scales with the frame rather than drifting from it.
	//
	// In button.png the frame is 17.25u tall around a 4.25u capital, so md's 5u
	// of breathing room above the cap is the reference, not a guess.
	const SIZES = {
		md: 'punk-btn-md text-ui-xs',
		sm: 'punk-btn-sm text-ui-xs',
		xs: 'punk-btn-xs text-ui-xs'
	};

	let {
		variant = 'outline',
		size = 'md',
		children,
		...rest
	}: {
		variant?: keyof typeof VARIANTS;
		size?: keyof typeof SIZES;
		children: Snippet;
	} & HTMLButtonAttributes = $props();
</script>

<button
	type="button"
	class="punk-btn punk-frame punk-cap inline-flex items-center justify-center gap-2
	       uppercase {VARIANTS[variant]} {SIZES[size]}"
	{...rest}
>
	{@render children()}
</button>

<style>
	/* The frame itself is the shared `punk-frame` utility (see layout.css) — the
	   uneven bars and open corners are the game's language for every control,
	   not something specific to buttons. This block only says what a *button*
	   adds on top: padding, and how it answers the pointer. */
	.punk-btn {
		position: relative;
		/* Fill the body but leave the frame's four cut corners transparent, so the
		   button reads as open-cornered over whatever sits behind it. */
		--frame-fill: var(--color-void);
		/* The game's rest label is a quiet warm grey, not white (button.png reads
		   pure white in the capture only because the 3.5x downscale antialiases the
		   ink — at integer scale it has to be dimmed by hand). White is reserved for
		   the primary call to action. */
		color: var(--color-muted);
		/* The game's UI does not ease. Every state change is the next frame. */
		transition: none;
	}

	/* Padding leaves room for the frame itself (the bars sit inside the box), so
	   the visual gap between frame and label is the padding minus --u. The extra
	   --cap-fix on the bottom is what actually centres the label — see the note
	   on that token in layout.css. */
	.punk-btn-md {
		padding-block: calc(7 * var(--u)) calc(7 * var(--u) + var(--cap-fix));
		padding-inline: calc(10 * var(--u));
	}
	.punk-btn-sm {
		padding-block: calc(3 * var(--u)) calc(3 * var(--u) + var(--cap-fix));
		padding-inline: calc(5 * var(--u));
	}
	.punk-btn-xs {
		padding-block: calc(2 * var(--u)) calc(2 * var(--u) + var(--cap-fix));
		padding-inline: calc(3 * var(--u));
	}

	.punk-btn-outline {
		--frame: var(--color-edge);
	}
	.punk-btn-primary {
		--frame: var(--color-ink);
		/* The one button that reads white — it is the call to action. */
		color: var(--color-ink);
	}
	.punk-btn-ghost {
		--frame: var(--color-edge-dim);
		color: var(--color-muted);
	}
	.punk-btn-danger {
		--frame: var(--color-edge-dim);
		color: var(--color-muted);
	}

	/* Hover recolours only the frame — the label holds its colour. The orange
	   fringe in button_hover.png is the game's post-process bloom, not part of the
	   widget, so it is deliberately NOT reproduced: a CSS glow reads as a soft
	   halo on a face this hard-edged. */
	.punk-btn:hover:not(:disabled) {
		--frame: var(--color-accent);
	}
	.punk-btn-ghost:hover:not(:disabled) {
		--frame: var(--color-edge);
	}
	.punk-btn-danger:hover:not(:disabled) {
		--frame: var(--color-danger);
	}

	/* Held down, the frame flares white regardless of variant — the interior
	   lifts off pure black too (button_pressed.png). The label keeps its colour;
	   only the frame answers the press. */
	.punk-btn:active:not(:disabled) {
		--frame: var(--color-ink);
		/* Sampled from button_pressed.png, where the interior is not quite black
		   any more — the frame's bloom spills into it. */
		--frame-fill: #0d0906;
	}

	.punk-btn:disabled {
		--frame: var(--color-edge-dim);
		color: var(--color-muted);
		opacity: 0.5;
	}

	.punk-btn:focus-visible {
		outline: var(--u) solid var(--color-accent);
		outline-offset: var(--u);
	}
</style>
