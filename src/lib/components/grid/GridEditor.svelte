<script lang="ts">
	import Button from '../Button.svelte';
	import ModulePicker from '../ModulePicker.svelte';
	import GridCanvas from './GridCanvas.svelte';
	import ModuleEditDialog from './ModuleEditDialog.svelte';
	import VaultDock from './VaultDock.svelte';
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

	// Esc settles a carry before it may close the screen, and Ctrl+Z/Y drive
	// the grid's own history (scoped to module operations, per the plan).
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && grid.carried) {
			grid.cancelCarry();
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
				<div class="flex gap-2">
					{#each grid.ships as ship (ship.entityId)}
						<Button
							size="xs"
							variant={grid.owner?.entityId === ship.entityId ? 'primary' : 'ghost'}
							onclick={() => (grid.shipId = ship.entityId)}
						>
							{ship.entityId}
						</Button>
					{/each}
				</div>
			{/if}
			<Button size="xs" onclick={() => (pickerOpen = true)}>Add a module…</Button>
			<!-- Game-parity validation. Off, drops always land and the canvas
			     marks every broken rule instead — the game never re-checks a
			     loaded save, so such a layout plays fine. -->
			<label class="strict-toggle">
				<input type="checkbox" class="punk-check" bind:checked={grid.strict} />
				Game rules
			</label>
			<Button
				size="xs"
				variant={grid.mode === 'paint' ? 'primary' : 'ghost'}
				onclick={() => grid.setMode(grid.mode === 'paint' ? 'modules' : 'paint')}
			>
				Paint cells
			</Button>
			{#if grid.mode === 'paint'}
				<!-- The brush: left button paints it, right button clears back to
				     normal. The reroll runs the game's own generation once more. -->
				<div class="flex items-center gap-2">
					<Button
						size="xs"
						variant={grid.brush === 'LevelUp' ? 'primary' : 'ghost'}
						onclick={() => (grid.brush = 'LevelUp')}
					>
						Booster
					</Button>
					<Button
						size="xs"
						variant={grid.brush === 'Invalid' ? 'primary' : 'ghost'}
						onclick={() => (grid.brush = 'Invalid')}
					>
						Blocked
					</Button>
					<Button size="xs" onclick={grid.reroll}>Reroll</Button>
					<span class="hint text-ui-xs">right button clears · middle drag pans</span>
				</div>
			{/if}
			<span class="flex-1"></span>
			<Button size="xs" variant="ghost" disabled={grid.undoDepth === 0} onclick={grid.undo}>
				Undo
			</Button>
			<Button size="xs" variant="ghost" disabled={grid.redoDepth === 0} onclick={grid.redo}>
				Redo
			</Button>
			<Button variant="ghost" size="sm" onclick={() => (open = false)}>Close</Button>
		</header>

		{#if grid.owner}
			<div class="flex min-h-0 flex-1">
				<GridCanvas {grid} onedit={openEditor} />
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
	}
	.grid-editor[open] {
		display: flex;
		flex-direction: column;
	}

	.grid-band {
		display: flex;
		flex: none;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1.25rem;
		border-bottom: 2px solid var(--color-edge-dim);
	}

	.strict-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--text-ui-xs);
		line-height: var(--text-ui-xs--line-height);
		text-transform: uppercase;
		color: var(--color-muted);
		cursor: pointer;
	}

	.hint {
		color: var(--color-muted);
		white-space: nowrap;
	}
</style>
