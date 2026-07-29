<script lang="ts">
	import type { Snippet } from 'svelte';
	import ScrollBar from './ScrollBar.svelte';
	import { sound } from '$lib/sound.svelte';

	// The one place that defines what a modal looks like and how it behaves.
	//
	// It is a real `<dialog>` because `showModal()` is what gives a focus trap,
	// an inert page behind it and Esc-to-close for free — none of which have an
	// attribute equivalent, so the open state has to drive the imperative call.
	//
	// The shell is the same warm slab the editor's cards wear, square-cornered,
	// with a title band on top and an optional footer band below. `tone` recolours
	// the edge, and `warn` is its one value: it marks a dialog that leaves the
	// guarantees the rest of the app keeps — the custom-shape painter, and the two
	// confirms in the restore browser, one overwriting a save folder and the other
	// deleting an archive, with nothing behind either.
	let {
		open = $bindable(false),
		title,
		width = '34rem',
		tone = 'default',
		header,
		footer,
		children,
		onclose
	}: {
		open?: boolean;
		title: string;
		/** Max width of the slab; it shrinks with the viewport below that. */
		width?: string;
		tone?: 'default' | 'warn';
		/** Extra controls on the title band, e.g. a filter box or a Close button. */
		header?: Snippet;
		footer?: Snippet;
		children: Snippet;
		/** Called when the dialog closes, however it was closed (Esc included). */
		onclose?: () => void;
	} = $props();

	let dialog = $state<HTMLDialogElement | null>(null);

	/** The body, handed to ScrollBar so it can draw the bar the body hides. */
	let body = $state<HTMLElement | null>(null);

	// The effect only touches the DOM; it assigns no state. The open sound is the
	// game's own vault screen arriving, played over the same beat as the rise
	// below; its closing half rides the `onclose` event rather than this effect,
	// because Esc closes the element itself and never reaches the branch here.
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
			sound.play('open');
		} else if (!open && dialog.open) dialog.close();
	});
</script>

<!-- `m-auto` is what centres the dialog: the UA centres a modal with its own
     `margin: auto`, which Tailwind's preflight reset zeroes out. -->
<dialog
	bind:this={dialog}
	class="punk-dialog punk-slab m-auto max-h-[85vh] flex-col p-0 text-ink"
	class:is-warn={tone === 'warn'}
	style:width="min({width}, 92vw)"
	onclose={() => {
		open = false;
		sound.play('close');
		onclose?.();
	}}
	onclick={(e) => {
		// A click that lands on the dialog element itself is the backdrop: its
		// content fills the box, so anything else has a child as its target.
		if (e.target === dialog) open = false;
	}}
>
	<div class="dialog-band border-b-2">
		<h2 class="punk-panel-title shrink-0 whitespace-nowrap text-accent">{title}</h2>
		{#if header}{@render header()}{/if}
	</div>

	<!-- The bar is a sibling of the scroller, not a child of it, or it would ride
	     the content it measures. This box is what it is measured against. -->
	<div class="dialog-scroll">
		<div class="dialog-body" bind:this={body}>{@render children()}</div>
		<ScrollBar scroller={body} contained />
	</div>

	{#if footer}
		<div class="dialog-band border-t-2">{@render footer()}</div>
	{/if}
</dialog>

<style>
	/* The slab is `punk-slab`; this only says what a *dialog* adds — the backdrop
	   it darkens the page with, and a brighter edge than a card carries, because
	   it sits over the page rather than in it. */
	.punk-dialog {
		border-color: var(--color-edge);
	}

	/* A column so the body can be the only part that scrolls. `display` has to be
	   set on the open state alone — an unconditional `display: flex` would
	   override the UA's `display: none` and leave a closed dialog on the page.
	   That same attribute is what starts the arrival: a modal has no fold to
	   cross, so opening is its equivalent of a section scrolling into view. */
	.punk-dialog[open] {
		display: flex;
		animation:
			dialog-fade var(--reveal-duration) var(--reveal-ease-fade),
			dialog-rise var(--reveal-duration) var(--reveal-ease);
	}

	/* The editor's one arrival motion (--reveal-* in layout.css, and the sections'
	   `reveal` action), as two animations rather than one so opacity and position
	   keep their own eases the way the action pairs them. Only the `from` is
	   given: the `to` is wherever the dialog already sits, which is what keeps the
	   centring `margin: auto` out of it.

	   Nothing plays on close. The rest of the app has no exit either — a section
	   leaves with its tab — and a modal that lingers reads as slow to dismiss. */
	@keyframes dialog-fade {
		from {
			opacity: 0;
		}
	}

	@keyframes dialog-rise {
		from {
			transform: translateY(var(--reveal-rise));
		}
	}

	/* `::backdrop` only started inheriting custom properties from its originating
	   element in 2023, and this app still runs on the WebKitGTK some Linux distros
	   ship. Where the token does not resolve the declaration would be dropped
	   entirely and the page behind would not dim at all, so the token carries its
	   own value as a fallback. */
	.punk-dialog::backdrop {
		/* palette-ok: --color-backdrop's own value, repeated as the fallback above. */
		background-color: var(--color-backdrop, rgb(0 0 0 / 0.8));
	}

	/* The page dims over the same beat the dialog rises, or the black lands first
	   and the modal looks late to its own arrival. Both tokens carry fallbacks for
	   the same reason the colour above does. */
	.punk-dialog[open]::backdrop {
		animation: dialog-fade var(--reveal-duration, 360ms) var(--reveal-ease-fade, ease-out);
	}

	/* Anyone who asked the OS to keep still gets the dialog simply present, which
	   is what the `reveal` action does for the sections. */
	@media (prefers-reduced-motion: reduce) {
		.punk-dialog[open],
		.punk-dialog[open]::backdrop {
			animation: none;
		}
	}

	/* The off-road tone: an amber edge for a dialog whose output the game itself
	   could not have produced. */
	.punk-dialog.is-warn {
		border-color: color-mix(in srgb, var(--color-amber) 60%, transparent);
	}

	/* Title band and footer band are the same strip, top and bottom. */
	.dialog-band {
		display: flex;
		flex: none;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1.25rem;
		border-color: var(--color-edge-dim);
		border-style: solid;
	}

	/* The body scrolls, not the dialog: the bands stay put while a long list
	   moves under them. `min-height: 0` is what lets a flex child shrink below
	   its content and actually overflow. */
	.dialog-scroll {
		position: relative;
		display: flex;
		flex: 1;
		min-height: 0;
	}

	.dialog-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 1rem 1.25rem;

		/* The same trade `.crt-screen` makes, for the same reason: WebView2 and
		   WebKitGTK draw a classic grey gutter, and a modal is the last place the
		   app should hand out 15px of OS chrome. ScrollBar above draws the
		   replacement. Both properties on purpose — the standard one for current
		   engines, the -webkit- rule for older WebKitGTK. */
		scrollbar-width: none;
	}

	.dialog-body::-webkit-scrollbar {
		display: none;
	}
</style>
