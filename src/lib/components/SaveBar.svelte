<script lang="ts">
	import Button from './Button.svelte';
	import InfoPop from './InfoPop.svelte';
	import type { EditorState } from '$lib/editor/state.svelte';

	// The open save and the two controls that act on it, on a strip that pins
	// itself to the top of the screen once you scroll past it. Saving is the one
	// thing you may want at any depth of a long panel, and the editor's tabs run
	// several screens deep — reaching it used to mean scrolling all the way back.
	//
	// It is a sibling of EditorHeader rather than a part of it because a sticky
	// element can only travel inside its own parent's box: kept in the header, it
	// would unpin again the moment the mark above it scrolled away. Its parent has
	// to be the element that spans the page.

	let { editor }: { editor: EditorState } = $props();

	let bar = $state<HTMLElement | null>(null);
	/** Pinned to the top, as opposed to sitting in the flow under the mark. */
	let stuck = $state(false);

	$effect(() => {
		const node = bar;
		if (!node) return;

		let queued = false;
		const check = () => {
			queued = false;
			// Sticky holds the strip at the scroller's top edge, and `.crt-screen`
			// fills the viewport — so it is pinned exactly when its own top has
			// stopped at zero. A hair of slack for fractional device pixels.
			stuck = node.getBoundingClientRect().top <= 0.5;
		};
		// One read per frame at most: the check measures, and measuring on every
		// scroll event forces a layout the browser had not asked for.
		const schedule = () => {
			if (queued) return;
			queued = true;
			requestAnimationFrame(check);
		};

		// Capture, because the app scrolls inside `.crt-screen` and not the window
		// (see docs/design.md) — a scroll event from a nested scroller never
		// reaches the window on the bubbling phase.
		window.addEventListener('scroll', schedule, { capture: true, passive: true });
		window.addEventListener('resize', schedule);
		check();

		return () => {
			window.removeEventListener('scroll', schedule, true);
			window.removeEventListener('resize', schedule);
		};
	});
</script>

<!-- The "how downloading works" note folds behind the Download changes button,
     only in the download-only browsers that need it. -->
{#snippet downloadNote()}
	This browser can't modify the savefiles directly. <strong class="text-amber"
		>Download changes</strong
	> gives you a zip of the files you edited — extract it into your save folder to apply it. Backup
	hands you the whole folder the same way; putting one back has to be done by hand here. Don't modify
	the save while it's open in the game.
{/snippet}

<div class="save-bar" class:is-stuck={stuck} bind:this={bar}>
	<span class="bar-spring"></span>
	<span class="text-muted text-ui-xs">{editor.slot?.dir.name}</span>
	<span class="bar-spring is-middle"></span>

	<div class="bar-actions">
		<InfoPop note={editor.downloadMode ? downloadNote : undefined}>
			<Button
				variant="primary"
				size="sm"
				onclick={editor.save}
				disabled={!editor.dirty || editor.busy}
			>
				{editor.downloadMode ? 'Download changes' : 'Save changes'}
			</Button>
		</InfoPop>
		<!-- Backup and Restore are the pair the save folder itself is edited with,
		     so they sit beside Save rather than behind a menu. Restore is hidden
		     where it cannot work: a browser that can't write the folder can only
		     hand the archive back as a download. -->
		<Button variant="outline" size="sm" onclick={editor.backups.take} disabled={editor.busy}>
			Backup
		</Button>
		{#if editor.backups.canRestore}
			<Button variant="outline" size="sm" onclick={editor.backups.browse} disabled={editor.busy}>
				Restore
			</Button>
		{/if}
		<Button variant="primary" size="sm" onclick={editor.open} disabled={editor.busy}>
			Load new save
		</Button>
	</div>

	<span class="bar-spring"></span>
</div>

<style>
	/* Above the page, below the wait overlay (50) and the scrollbar (60), so a
	   load still covers everything and the bar never sits over the thumb. */
	.save-bar {
		position: sticky;
		top: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		padding-block: 0.75rem;
		margin-bottom: 1.75rem;
	}

	/* The black the page slides under once the strip is pinned, fading out below
	   it so content dissolves into the bar rather than being cut off by an edge.

	   Full-bleed out of the page's own gutter: the strip is chrome for the whole
	   screen, and a black band with a strip of live content either side of it
	   would read as a panel that happens to be black. `100vw` is the visible width
	   here because `.crt-screen` hides its scrollbar. */
	.save-bar::before {
		content: '';
		position: absolute;
		top: 0;
		left: 50%;
		width: 100vw;
		height: calc(100% + 3rem);
		transform: translateX(-50%);
		/* Solid for exactly the strip's own height, then the 3rem tail is the fade. */
		background: linear-gradient(to bottom, var(--color-void) calc(100% - 3rem), transparent);
		opacity: 0;
		transition: opacity var(--reveal-duration) var(--reveal-ease-fade);
		/* Behind the row's own content (the bar's z-index makes it the stacking
		   context), and never in the way of a click on the content it veils. */
		z-index: -1;
		pointer-events: none;
	}

	.save-bar.is-stuck::before {
		opacity: 1;
	}

	/* Three empty cells are what let the row *slide* apart instead of jumping.
	   `justify-content` cannot be transitioned, but `flex-grow` can, so the free
	   space is handed to springs instead: at rest the two outer ones hold it all
	   and the group reads centred under the mark; pinned, the middle one takes it
	   and the name and the buttons end up in the two top corners.

	   The values have to cross rather than one spring going 0 -> 1 on its own.
	   Free space is split between everything with a grow above zero, so a single
	   spring would swallow the lot the instant its value left 0 and the row would
	   snap across in one frame. */
	.bar-spring {
		flex: 1 1 0;
		transition: flex-grow var(--reveal-duration) var(--reveal-ease);
	}

	/* Its basis is the gap between the name and the buttons at rest. */
	.bar-spring.is-middle {
		flex: 0 1 1rem;
	}

	.save-bar.is-stuck .bar-spring {
		flex-grow: 0;
	}

	.save-bar.is-stuck .bar-spring.is-middle {
		flex-grow: 1;
	}

	/* Four controls is more than a narrow window fits on one line, and the row
	   wraps toward its own corner rather than stretching the strip. */
	.bar-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		align-items: center;
		gap: 0.75rem 1rem;
	}

	/* Anyone who asked the OS to keep still gets both states, just without the
	   travel between them — the same deal the arrival motion offers. */
	@media (prefers-reduced-motion: reduce) {
		.save-bar::before,
		.bar-spring {
			transition: none;
		}
	}
</style>
