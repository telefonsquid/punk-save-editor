<script lang="ts">
	import { windowChrome as chrome, type ResizeDirection } from '$lib/window-chrome.svelte';

	// The edges to resize the undecorated window by, where the OS no longer
	// provides them. Without a frame the only border left to grab is whatever the
	// windowing layer keeps around a borderless window, and that differs:
	//
	// - macOS keeps full resize edges on a borderless window. Nothing here.
	// - Windows keeps the three outside the window, in the invisible band its drop
	//   shadow sits in — but the top edge falls inside, and the webview covers it.
	//   So only the top and its two corners are drawn.
	// - Linux (GTK) has no band at all; the edges sit inside the window, under the
	//   webview. All eight are drawn.
	//
	// Each strip hands the press to `startResizeDragging`, which runs the OS's own
	// resize from there. Gone while maximized or fullscreen, where the OS refuses a
	// resize anyway and the strips would only eat clicks meant for the page.
	//
	// Fixed to the viewport, so whoever mounts this must not sit inside a filter
	// or transform that would pin it to something smaller — the layout mounts it
	// outside `.crt-screen`, the grid editor as a direct child of its layer.

	type Edge = { dir: ResizeDirection; place: string };

	const TOP: Edge[] = [
		{ dir: 'North', place: 'is-n' },
		{ dir: 'NorthWest', place: 'is-nw' },
		{ dir: 'NorthEast', place: 'is-ne' }
	];
	const ALL: Edge[] = [
		...TOP,
		{ dir: 'South', place: 'is-s' },
		{ dir: 'West', place: 'is-w' },
		{ dir: 'East', place: 'is-e' },
		{ dir: 'SouthWest', place: 'is-sw' },
		{ dir: 'SouthEast', place: 'is-se' }
	];

	const edges = $derived(
		!chrome.resizable ? [] : chrome.style === 'linux' ? ALL : chrome.style === 'windows' ? TOP : []
	);

	function grab(e: PointerEvent, dir: ResizeDirection) {
		if (e.button !== 0) return;
		e.preventDefault();
		void chrome.startResize(dir);
	}
</script>

{#each edges as edge (edge.dir)}
	<div class="window-edge {edge.place}" aria-hidden="true" onpointerdown={(e) => grab(e, edge.dir)}></div>
{/each}

<style>
	/* Thin enough to never cover a control's worth of the page, and under the
	   app's scrollbar (60) so the thumb still wins where the two meet. */
	.window-edge {
		--edge: 4px;
		--corner: 12px;
		position: fixed;
		z-index: 55;
	}

	.is-n {
		top: 0;
		left: var(--corner);
		right: var(--corner);
		height: var(--edge);
		cursor: ns-resize;
	}
	.is-s {
		bottom: 0;
		left: var(--corner);
		right: var(--corner);
		height: var(--edge);
		cursor: ns-resize;
	}
	.is-w {
		left: 0;
		top: var(--edge);
		bottom: var(--corner);
		width: var(--edge);
		cursor: ew-resize;
	}
	.is-e {
		right: 0;
		top: var(--edge);
		bottom: var(--corner);
		width: var(--edge);
		cursor: ew-resize;
	}

	/* The two top corners stay edge-thin — the window buttons are tucked into
	   them and keep all but a hairline of their face — so they are just the ends
	   of the top edge turned diagonal, and the side edges run up to meet them.
	   The bottom corners have nothing to share the space with and are squares. */
	.is-nw,
	.is-ne {
		width: var(--corner);
		height: var(--edge);
	}
	.is-sw,
	.is-se {
		width: var(--corner);
		height: var(--corner);
	}
	.is-nw {
		top: 0;
		left: 0;
		cursor: nwse-resize;
	}
	.is-ne {
		top: 0;
		right: 0;
		cursor: nesw-resize;
	}
	.is-sw {
		bottom: 0;
		left: 0;
		cursor: nesw-resize;
	}
	.is-se {
		bottom: 0;
		right: 0;
		cursor: nwse-resize;
	}
</style>
