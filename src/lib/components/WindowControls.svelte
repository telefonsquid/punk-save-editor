<script lang="ts">
	import { windowChrome as chrome } from '$lib/window-chrome.svelte';

	// Minimize, maximize and close, drawn the way the OS the app is running on
	// draws them: Windows 11's flat caption buttons, macOS's traffic lights,
	// GNOME's round buttons. The window is undecorated (see
	// $lib/window-chrome.svelte.ts), so these are the only ones it has, and
	// someone reaching for the corner of a window reaches for the shape their OS
	// taught them.
	//
	// The one concession to the app is colour: every neutral is a palette token,
	// so the buttons sit on the bar in the same warm greys as the panels under
	// them. The colours that ARE the OS's — Windows' close red, the three lights —
	// are tokens of their own in layout.css.
	//
	// Silent on purpose: the interface sounds follow the game's controls, and
	// these are the OS's.

	const maxLabel = $derived(chrome.maximized ? 'Restore' : 'Maximize');
</script>

{#if chrome.style === 'mac'}
	<!-- Close, minimize, zoom, left to right. The glyphs show on all three at
	     once while the pointer is over the group, the way macOS does it. Zoom
	     carries the plus rather than the fullscreen arrows: it maximizes, and
	     the plus is the glyph macOS gives that action. -->
	<div class="controls is-mac" class:is-blurred={!chrome.focused}>
		<button type="button" class="light is-close" aria-label="Close" onclick={chrome.close}>
			<svg viewBox="0 0 12 12" aria-hidden="true">
				<path d="M3.5 3.5l5 5M8.5 3.5l-5 5" />
			</svg>
		</button>
		<button type="button" class="light is-min" aria-label="Minimize" onclick={chrome.minimize}>
			<svg viewBox="0 0 12 12" aria-hidden="true">
				<path d="M2.75 6h6.5" />
			</svg>
		</button>
		<button type="button" class="light is-zoom" aria-label={maxLabel} onclick={chrome.toggleMaximize}>
			<svg viewBox="0 0 12 12" aria-hidden="true">
				<path d="M6 2.75v6.5M2.75 6h6.5" />
			</svg>
		</button>
	</div>
{:else if chrome.style === 'windows'}
	<!-- Segoe Fluent's caption glyphs, redrawn on their 10px grid with hairline
	     strokes. Half-pixel coordinates put each 1px line on a whole pixel. -->
	<div class="controls is-windows" class:is-blurred={!chrome.focused}>
		<button type="button" class="caption" aria-label="Minimize" title="Minimize" onclick={chrome.minimize}>
			<svg viewBox="0 0 10 10" aria-hidden="true">
				<path d="M0 5.5h10" />
			</svg>
		</button>
		<button
			type="button"
			class="caption"
			aria-label={maxLabel}
			title={maxLabel}
			onclick={chrome.toggleMaximize}
		>
			<svg viewBox="0 0 10 10" aria-hidden="true">
				{#if chrome.maximized}
					<path d="M0.5 2.5h7v7h-7z M2.5 2.5v-2h7v7h-2" />
				{:else}
					<path d="M0.5 0.5h9v9h-9z" />
				{/if}
			</svg>
		</button>
		<button type="button" class="caption is-close" aria-label="Close" title="Close" onclick={chrome.close}>
			<svg viewBox="0 0 10 10" aria-hidden="true">
				<path d="M0 0l10 10M10 0l-10 10" />
			</svg>
		</button>
	</div>
{:else if chrome.style === 'linux'}
	<!-- libadwaita's circular window buttons with its symbolic icons. Close
	     stays grey: GNOME has no red close. -->
	<div class="controls is-linux" class:is-blurred={!chrome.focused}>
		<button type="button" class="round" aria-label="Minimize" title="Minimize" onclick={chrome.minimize}>
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<path d="M4.5 11h7" />
			</svg>
		</button>
		<button
			type="button"
			class="round"
			aria-label={maxLabel}
			title={maxLabel}
			onclick={chrome.toggleMaximize}
		>
			<svg viewBox="0 0 16 16" aria-hidden="true">
				{#if chrome.maximized}
					<rect x="5.5" y="5.5" width="5" height="5" rx="1" />
				{:else}
					<rect x="4.5" y="4.5" width="7" height="7" rx="1" />
				{/if}
			</svg>
		</button>
		<button type="button" class="round" aria-label="Close" title="Close" onclick={chrome.close}>
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<path d="M5 5l6 6M11 5l-6 6" />
			</svg>
		</button>
	</div>
{/if}

<style>
	.controls {
		display: flex;
		align-self: stretch;
		align-items: center;
	}

	.controls button {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--color-ink);
		cursor: default;
		transition: none;
	}

	.controls svg {
		fill: none;
		stroke: currentColor;
	}

	/* A window in the background keeps its buttons but dims them. macOS greys
	   its lights instead, below. */
	.controls.is-blurred:not(.is-mac) button {
		color: var(--color-muted);
	}

	/* ---- Windows 11: 46 x bar-height caption buttons, flush to the corner. */
	.is-windows {
		gap: 0;
	}
	.caption {
		width: 46px;
		height: 100%;
	}
	.caption svg {
		width: 10px;
		height: 10px;
		stroke-width: 1;
		shape-rendering: crispEdges;
	}
	/* The diagonals of the cross read as a smudge when snapped, so only the
	   square glyphs are crisp-edged. */
	.caption.is-close svg {
		shape-rendering: geometricPrecision;
	}
	.caption:hover {
		background-color: color-mix(in srgb, var(--color-ink) 9%, transparent);
	}
	.caption:active {
		background-color: color-mix(in srgb, var(--color-ink) 6%, transparent);
	}
	.caption.is-close:hover {
		background-color: var(--color-os-close);
		color: var(--color-ink);
	}
	.caption.is-close:active {
		background-color: color-mix(in srgb, var(--color-os-close) 90%, transparent);
	}
	.caption:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}

	/* ---- macOS: three 12px lights on a 20px pitch, 8px in from the corner. */
	.is-mac {
		gap: 8px;
		padding-inline: 8px;
	}
	.light {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		/* The darker keyline macOS draws around each light, as an inset shadow so
		   it costs no size. */
		box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--color-void) 18%, transparent);
	}
	.light.is-close {
		background-color: var(--color-os-mac-close);
		color: var(--color-os-mac-close-ink);
	}
	.light.is-min {
		background-color: var(--color-os-mac-min);
		color: var(--color-os-mac-min-ink);
	}
	.light.is-zoom {
		background-color: var(--color-os-mac-zoom);
		color: var(--color-os-mac-zoom-ink);
	}
	.light svg {
		width: 12px;
		height: 12px;
		stroke-width: 1.25;
		stroke-linecap: round;
		opacity: 0;
	}
	.is-mac:hover .light svg,
	.light:focus-visible svg {
		opacity: 1;
	}
	.light:active {
		filter: brightness(0.8);
	}
	.light:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
	}
	/* A background window's lights go grey until the pointer comes back to them. */
	.is-mac.is-blurred:not(:hover) .light {
		background-color: var(--color-edge-dim);
	}

	/* ---- GNOME: 24px circles, a tenth of the ink behind the symbol. */
	.is-linux {
		gap: 10px;
		padding-inline: 4px 6px;
	}
	/* Two classes, to outrank the transparent reset on every control button. */
	.is-linux .round {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background-color: color-mix(in srgb, var(--color-ink) 10%, transparent);
	}
	.round:hover {
		background-color: color-mix(in srgb, var(--color-ink) 15%, transparent);
	}
	.round:active {
		background-color: color-mix(in srgb, var(--color-ink) 30%, transparent);
	}
	.round svg {
		width: 16px;
		height: 16px;
		stroke-width: 1.5;
		stroke-linecap: round;
	}
	.round:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
	}
</style>
