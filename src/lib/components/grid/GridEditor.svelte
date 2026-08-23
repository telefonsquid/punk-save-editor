<script lang="ts">
	import Button from '../Button.svelte';
	import ModulePicker from '../ModulePicker.svelte';
	import GridCanvas from './GridCanvas.svelte';
	import ModuleEditDialog from './ModuleEditDialog.svelte';
	import SaveActions from '../SaveActions.svelte';
	import VaultDock from './VaultDock.svelte';
	import PixelSprite from './PixelSprite.svelte';
	import { SLOT_BLOCKED, SLOT_BOOST, SLOT_EMPTY } from '$lib/game/grid-icons';
	import { syncModal } from '../modal';
	import { GridEditorState } from '$lib/editor/grid.svelte';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { equippableModules } from '$lib/game/data';
	import type { CellKey } from '$lib/game/grid-rules';
	import type { OdinNode } from '$lib/save/odin';
	import { sound } from '$lib/sound.svelte';

	// The module-grid editor: a full-viewport modal over the whole app, the way
	// the game's grid screen covers the game. A real <dialog> for the same
	// reasons Dialog.svelte is one — and because the top layer escapes
	// .crt-screen's filter, which eats position:fixed everywhere else. The
	// canvas and its chrome are unmounted while closed, so every open starts
	// recentred on the ship.
	let { editor, open = $bindable(false) }: { editor: EditorState; open?: boolean } = $props();

	// The editor instance is created once in +page and never swapped, so
	// capturing the initial prop value is exactly right (same as RawTree).
	// svelte-ignore state_referenced_locally
	const grid = new GridEditorState(editor);

	let dialog = $state<HTMLDialogElement | null>(null);
	// A carried module follows the pointer across the whole screen, dock
	// included, so the position is tracked here rather than on the canvas.
	let cursorX = $state(0);
	let cursorY = $state(0);
	let pickerOpen = $state(false);
	let editNode = $state.raw<OdinNode | null>(null);
	let editFile = $state<'entities' | 'vault'>('entities');
	let editOpen = $state(false);

	const addableModuleIds = equippableModules().map(({ id }) => id);

	// Same contract as Dialog.svelte, via the shared `syncModal`. The open and
	// close sounds are the game's own grid screen arriving and leaving.
	$effect(() => syncModal(dialog, open));

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

	// Esc settles a carry (or the armed brush) before it may close the screen,
	// and Ctrl+Z/Y drive the grid's own history (scoped to module operations,
	// per the plan).
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && (grid.carried || grid.slotBrush)) {
			if (grid.carried) grid.cancelCarry();
			else grid.disarmBrush();
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

<dialog
	bind:this={dialog}
	class="grid-editor text-ink"
	{onkeydown}
	onpointermove={(e) => {
		cursorX = e.clientX;
		cursorY = e.clientY;
	}}
	onclose={() => {
		open = false;
		sound.play('close');
	}}
>
	{#if open}
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
	{/if}
</dialog>

<style>
	/* Full-bleed: the game's grid screen owns the whole display, so this dialog
	   clears the UA's inset margins and size caps instead of floating as a card. */
	.grid-editor {
		width: 100vw;
		height: 100vh;
		max-width: none;
		max-height: none;
		margin: 0;
		padding: 0;
		border: 0;
		background-color: var(--color-void);
		/* The top layer is outside `.crt-screen`, so the screen this one covers
		   takes its own copy of the CRT filter (CrtFilter.svelte) — without it the
		   grid is the one surface in the app with no aberration or bloom on it.
		   Viewport-sized like the wrapper's, which is what keeps the buffer under
		   the browser's size cap. */
		filter: url(#crt);
	}
	/* The `[open]` attribute carries the arrival as well as the layout, exactly as
	   in Dialog: a modal has no fold to scroll across, so opening is its
	   equivalent. Same two `--reveal-*` animations, so opacity and position keep
	   their own eases. The whole screen moves rather than its contents — the band
	   and the board are one surface arriving, not two. */
	.grid-editor[open] {
		display: flex;
		flex-direction: column;
		animation:
			screen-fade var(--reveal-duration) var(--reveal-ease-fade),
			screen-rise var(--reveal-duration) var(--reveal-ease);
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

	/* The rise leaves the top of the viewport uncovered on the way in, so the
	   backdrop behind it has to be the app's own black rather than the UA's grey
	   wash, and has to dim over the same beat. Both carry fallbacks because older
	   WebKitGTK does not inherit custom properties into `::backdrop` — see
	   Dialog.svelte. */
	.grid-editor::backdrop {
		/* palette-ok: --color-backdrop's own value, repeated as the fallback above. */
		background-color: var(--color-backdrop, rgb(0 0 0 / 0.8));
	}
	.grid-editor[open]::backdrop {
		animation: screen-fade var(--reveal-duration, 360ms) var(--reveal-ease-fade, ease-out);
	}

	/* Nothing plays on exit, and anyone who asked the OS to keep still gets the
	   screen simply present. */
	@media (prefers-reduced-motion: reduce) {
		.grid-editor[open],
		.grid-editor[open]::backdrop {
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
