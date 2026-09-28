<script lang="ts">
	import Button from '../Button.svelte';
	import ModulePicker from '../ModulePicker.svelte';
	import GridCanvas from './GridCanvas.svelte';
	import ModuleEditDialog from './ModuleEditDialog.svelte';
	import SaveActions from '../SaveActions.svelte';
	import VaultDock from './VaultDock.svelte';
	import PixelSprite from './PixelSprite.svelte';
	import WindowEdges from '../WindowEdges.svelte';
	import { SLOT_BLOCKED, SLOT_BOOST, SLOT_EMPTY } from '$lib/game/grid-icons';
	import { GridEditorState } from '$lib/editor/grid.svelte';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { equippableModules } from '$lib/game/data';
	import type { CellKey } from '$lib/game/grid-rules';
	import type { OdinNode } from '$lib/save/odin';
	import { sound } from '$lib/sound.svelte';
	import { untrack } from 'svelte';

	// The module-grid editor: a screen over the whole app below the title bar,
	// the way the game's grid screen covers the game.
	//
	// Not a modal <dialog>. A modal makes everything outside it inert, the desktop
	// app's title bar included, so the window could only be moved or closed with
	// the grid open if the grid drew a second bar of its own — and that copy rode
	// the arrival over the real one. So this is a plain layer instead, pinned
	// under the one bar the layout draws (`--titlebar-h` down, 0 in a browser),
	// and what showModal() gave for free is done by hand: the page under it is
	// made inert, focus moves in and goes back where it was, Esc closes it.
	//
	// The layer is lifted out to <body> once, on mount: inside `.crt-screen` its
	// filter would pin `position: fixed` to the scrolling page, and the inert page
	// would take the grid down with it. The canvas and its chrome are unmounted
	// while closed, so every open starts recentred on the ship.
	let { editor, open = $bindable(false) }: { editor: EditorState; open?: boolean } = $props();

	// The editor instance is created once in +page and never swapped, so
	// capturing the initial prop value is exactly right (same as RawTree).
	// svelte-ignore state_referenced_locally
	const grid = new GridEditorState(editor);

	let layer = $state<HTMLElement | null>(null);
	let screen = $state<HTMLElement | null>(null);
	/** The page's screen the layer was drawn in, made inert while it is open. */
	let home: Element | null = null;
	// A carried module follows the pointer across the whole screen, dock
	// included, so the position is tracked here rather than on the canvas —
	// relative to the screen, which is what its fixed ghosts are placed in.
	let cursorX = $state(0);
	let cursorY = $state(0);
	let pickerOpen = $state(false);
	let editNode = $state.raw<OdinNode | null>(null);
	let editFile = $state<'entities' | 'vault'>('entities');
	let editOpen = $state(false);

	const addableModuleIds = equippableModules().map(({ id }) => id);

	$effect(() => {
		const node = layer;
		if (!node) return;
		home = node.closest('.crt-screen');
		document.body.append(node);
		return () => node.remove();
	});

	// The modal half. The open and close sounds are the game's own grid screen
	// arriving and leaving, played on the flag whichever way it flipped — Exit,
	// Esc and Back all close by clearing it. Only the flag is tracked: the sound
	// switch is state too, and flipping it must not reopen the screen.
	$effect(() => {
		if (!open) return;
		return untrack(() => {
			const back = document.activeElement;
			home?.setAttribute('inert', '');
			layer?.focus();
			sound.play('open');
			return () => {
				home?.removeAttribute('inert');
				sound.play('close');
				if (back instanceof HTMLElement && back.isConnected) back.focus();
			};
		});
	});

	function openEditor(key: CellKey) {
		editNode = grid.view?.modules.get(key)?.node ?? null;
		editFile = 'entities';
		editOpen = editNode !== null;
	}

	function openVaultEditor(node: OdinNode) {
		editNode = node;
		editFile = 'vault';
		editOpen = true;
	}

	// Esc settles a carry (or the armed brush) before it closes the screen, and
	// Ctrl+Z/Y drive the grid's own history (scoped to module operations, per
	// the plan). On the window rather than the layer, so a key pressed with
	// focus up in the title bar still reaches it. An Esc inside one of the
	// grid's own dialogs is that dialog's to close.
	function onkeydown(e: KeyboardEvent) {
		if (!open || e.defaultPrevented) return;
		if (e.key === 'Escape') {
			if (e.target instanceof Element && e.target.closest('dialog')) return;
			if (grid.carried) grid.cancelCarry();
			else if (grid.slotBrush) grid.disarmBrush();
			else open = false;
			e.preventDefault();
			return;
		}
		if (!(e.ctrlKey || e.metaKey)) return;
		const key = e.key.toLowerCase();
		if (key === 'z' && !e.shiftKey) {
			grid.undo();
			e.preventDefault();
		} else if (key === 'y' || (key === 'z' && e.shiftKey)) {
			grid.redo();
			e.preventDefault();
		}
	}
</script>

<svelte:window {onkeydown} />

<!-- The layer holds the dimming behind the screen and nothing else; the screen
     inside it is what arrives. -->
<div
	bind:this={layer}
	class="grid-layer"
	hidden={!open}
	role="dialog"
	aria-modal="true"
	aria-label="Module Grid"
	tabindex="-1"
	onpointermove={(e) => {
		// Measured each move: the screen is still rising for the first beat.
		const box = screen?.getBoundingClientRect();
		cursorX = e.clientX - (box?.left ?? 0);
		cursorY = e.clientY - (box?.top ?? 0);
	}}
>
	{#if open}
		<!-- The resize edges the layer covers (Linux's sides and bottom). Here,
		     outside the filtered screen, so they stay fixed to the window. -->
		<WindowEdges />

		<div bind:this={screen} class="grid-editor text-ink">
			<header class="grid-band">
				<h2 class="punk-panel-title whitespace-nowrap text-accent">Module Grid</h2>
				{#if grid.ships.length > 1}
					<!-- Co-op: one grid per player ship, picked here. -->
					{#each grid.ships as ship (ship.entityId)}
						<Button
							size="xs"
							variant={grid.owner?.entityId === ship.entityId ? 'primary' : 'ghost'}
							onclick={() => (grid.shipId = ship.entityId)}
						>
							{ship.entityId}
						</Button>
					{/each}
				{/if}
				<Button size="xs" onclick={() => (pickerOpen = true)}>Add Module</Button>
				<!-- The slot brushes: click one to arm it, click a cell to paint that
				     one cell — a placement like an added module's, shift to keep it
				     armed, right-click or Esc to put it down. The reroll runs the
				     game's own generation once more. -->
				<Button
					size="xs"
					variant={grid.slotBrush === 'LevelUp' ? 'primary' : 'ghost'}
					aria-pressed={grid.slotBrush === 'LevelUp'}
					title="Booster slot"
					aria-label="Place a booster slot"
					onclick={() => grid.armBrush('LevelUp')}
				>
					<span class="brush-glyph is-boost"><PixelSprite sprite={SLOT_BOOST} /></span>
				</Button>
				<Button
					size="xs"
					variant={grid.slotBrush === 'Invalid' ? 'primary' : 'ghost'}
					aria-pressed={grid.slotBrush === 'Invalid'}
					title="Blocked slot"
					aria-label="Place a blocked slot"
					onclick={() => grid.armBrush('Invalid')}
				>
					<span class="brush-glyph is-invalid"><PixelSprite sprite={SLOT_BLOCKED} /></span>
				</Button>
				<Button
					size="xs"
					variant={grid.slotBrush === 'Normal' ? 'primary' : 'ghost'}
					aria-pressed={grid.slotBrush === 'Normal'}
					title="Normal slot"
					aria-label="Clear a slot back to normal"
					onclick={() => grid.armBrush('Normal')}
				>
					<span class="brush-glyph is-normal"><PixelSprite sprite={SLOT_EMPTY} /></span>
				</Button>
				<Button size="xs" onclick={grid.reroll}>Reroll Grid</Button>
				<span class="flex-1"></span>
				<!-- The overlay covers the page's own save strip, so the same controls
				     come along — nobody should have to leave the grid to save it. First
				     thing dropped when the row runs out of room. -->
				<span class="band-save">
					<SaveActions {editor} size="xs" />
					<!-- The rule that keeps the guests from reading as more grid tools.
					     Part of the group, so it leaves when they do. -->
					<span class="band-split" aria-hidden="true"></span>
				</span>
				<Button size="xs" variant="ghost" disabled={grid.undoDepth === 0} onclick={grid.undo}>
					Undo
				</Button>
				<Button size="xs" variant="ghost" disabled={grid.redoDepth === 0} onclick={grid.redo}>
					Redo
				</Button>
				<Button variant="ghost" size="xs" onclick={() => (open = false)}>Exit</Button>
			</header>

			{#if grid.owner}
				<div class="flex min-h-0 flex-1">
					<GridCanvas {grid} {cursorX} {cursorY} onedit={openEditor} />
					<VaultDock {editor} {grid} onedit={openVaultEditor} />
				</div>
			{:else}
				<p class="m-auto text-ui-xs text-muted">No ship grid in this save.</p>
			{/if}

			<ModulePicker
				bind:open={pickerOpen}
				ids={addableModuleIds}
				onadd={(id, fields) => grid.carryNew(id, fields)}
			/>
			<ModuleEditDialog {editor} node={editNode} file={editFile} bind:open={editOpen} />
		</div>
	{/if}
</div>

<style>
	/* Everything below the title bar, above everything else on the page (the
	   app's scrollbar is 60). The dimming behind the screen, for the beat the
	   screen is still fading in. Clipped, so the rise enters from under the bar's
	   edge rather than hanging off the bottom of the window. */
	.grid-layer {
		position: fixed;
		inset: var(--titlebar-h) 0 0;
		z-index: 70;
		overflow: hidden;
		outline: none;
		background-color: var(--color-backdrop);
		animation: scrim-fade var(--reveal-duration) var(--reveal-ease-fade);
	}

	/* Full-bleed: the game's grid screen owns the whole display under the bar.
	   The layer is outside `.crt-screen`, so the screen takes its own copy of the
	   CRT filter (CrtFilter.svelte) — without it the grid is the one surface in
	   the app with no aberration or bloom on it. Window-sized like the wrapper's,
	   which is what keeps the buffer under the browser's size cap.

	   It arrives the way Dialog does: the same two `--reveal-*` animations, so
	   opacity and position keep their own eases. The whole screen moves rather
	   than its contents — the band and the board are one surface arriving, not
	   two — and the title bar above it does not move at all. */
	.grid-editor {
		display: flex;
		flex-direction: column;
		height: 100%;
		background-color: var(--color-void);
		filter: url(#crt);
		animation:
			screen-fade var(--reveal-duration) var(--reveal-ease-fade),
			screen-rise var(--reveal-duration) var(--reveal-ease);
	}

	@keyframes scrim-fade {
		from {
			background-color: transparent;
		}
	}

	@keyframes screen-fade {
		from {
			opacity: 0;
		}
	}

	@keyframes screen-rise {
		from {
			transform: translateY(var(--reveal-rise));
		}
	}

	/* Nothing plays on exit, and anyone who asked the OS to keep still gets the
	   screen simply present. */
	@media (prefers-reduced-motion: reduce) {
		.grid-layer,
		.grid-editor {
			animation: none;
		}
	}

	/* One gap for the whole band — every control is a direct child, so no group
	   sits closer together than the rest of the row. */
	.grid-band {
		display: flex;
		flex: none;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem;
		border-bottom: 2px solid var(--color-edge-dim);
	}
	.grid-band h2 {
		margin-right: 0.5rem;
	}

	/* The save controls are the band's guests: they take the row's own gap while
	   there is room for them and leave entirely once the grid's own tools would
	   start wrapping. The width is where the two groups meet at xs. */
	.band-save {
		display: contents;
	}
	@media (width < 1500px) {
		.band-save {
			display: none;
		}
	}

	/* The line between the two groups, the band's own border stood on its end. It
	   stretches instead of taking a height, so it stays as tall as the row's
	   tallest control whatever ends up in there. */
	.band-split {
		align-self: stretch;
		width: 2px;
		background-color: var(--color-edge-dim);
	}

	/* The brush buttons carry the marker sprites the canvas draws, at native size
	   and boxed to one width because the game's three are 8, 10 and 12 pixels
	   wide. Lit, not in the near-black the grid paints them: on a cell the shape
	   reads against bare ground, on a button it would vanish into the chrome.
	   The box is exactly the label's collapsed cap box, so a glyph button is as
	   tall as a text one — a taller sprite overhangs it rather than pushing the
	   frame around. */
	.brush-glyph {
		--u: 1px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 12px;
		height: 0.3125em;
		/* And the capitals hang below that box, so the sprite falls with them. */
		transform: translateY(var(--cap-drop));
	}
	.brush-glyph.is-boost {
		color: var(--color-amber);
	}
	.brush-glyph.is-invalid {
		color: var(--color-danger);
	}
	.brush-glyph.is-normal {
		color: var(--color-muted);
	}
</style>
