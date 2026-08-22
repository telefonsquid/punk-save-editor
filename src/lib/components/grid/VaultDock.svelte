<script lang="ts">
	import CloseBadge from '../CloseBadge.svelte';
	import ItemIcon from '../ItemIcon.svelte';
	import ScrollBar from '../ScrollBar.svelte';
	import GridHoverCard from './GridHoverCard.svelte';
	import type { GridEditorState } from '$lib/editor/grid.svelte';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { displayName, moduleInfo } from '$lib/game/data';
	import { groupModules } from '$lib/game/module-groups';
	import type { OdinNode } from '$lib/save/odin';
	import { getModules } from '$lib/save/vault';
	import { readModule } from '$lib/save/grid';
	import { sound } from '$lib/sound.svelte';

	// The vault as a dock beside the canvas — the game's right-hand vault panel.
	// Click a module to carry it out, click anywhere here while carrying to file
	// the carry away; hovering a tile offers the same info card and card editor
	// the grid's modules get, plus the remove cross the old vault cards had.
	let {
		editor,
		grid,
		onedit
	}: {
		editor: EditorState;
		grid: GridEditorState;
		/** A dock tile's EDIT chip was clicked. */
		onedit: (node: OdinNode) => void;
	} = $props();

	let body = $state<HTMLElement | null>(null);
	let hovered = $state.raw<{ node: OdinNode; top: number } | null>(null);

	// Snapshot per edit (the raw-tree rule); the module a carry took out of the
	// vault keeps its slot in the list — the tree still holds it — but hides,
	// the same way a carried grid tile leaves its cell empty.
	const rows = $derived.by(() => {
		if (editor.version < 0 || !editor.slot) return [];
		return getModules(editor.slot.vault)
			.map((m) => ({ node: m as unknown as OdinNode, id: m.moduleDataId }))
			.filter(({ node }) => !(grid.carried?.source === 'vault' && grid.carried.node === node));
	});
	const groups = $derived(groupModules(rows));

	const hoveredModule = $derived(hovered ? readModule(hovered.node) : null);

	function hoverTile(node: OdinNode, e: PointerEvent) {
		const dockTop = (e.currentTarget as HTMLElement).closest('.dock')!.getBoundingClientRect().top;
		hovered = { node, top: (e.currentTarget as HTMLElement).getBoundingClientRect().top - dockTop };
	}

	function clickTile(node: OdinNode) {
		if (grid.carried) grid.dropToVault();
		else grid.pickUpVault(node);
	}

	// The dock's background is a drop target while something is carried.
	function clickDock() {
		if (grid.carried) grid.dropToVault();
	}
</script>

<aside class="dock" class:is-target={!!grid.carried}>
	<header class="dock-head">
		<h3 class="punk-panel-title text-accent">Vault</h3>
		<span class="text-ui-xs text-muted">{rows.length}</span>
	</header>

	<div class="dock-scroll">
		<div
			class="dock-body"
			bind:this={body}
			onclick={clickDock}
			onpointerleave={() => (hovered = null)}
			role="presentation"
		>
			{#if rows.length === 0}
				<p class="text-ui-xs text-muted">Vault has no modules.</p>
			{/if}
			{#each groups as group (group.name)}
				<p class="punk-group-title">{group.name}</p>
				<div class="tile-grid">
					{#each group.items as row (row.node)}
						<div class="tile-wrap" role="presentation" onpointerenter={(e) => hoverTile(row.node, e)}>
							<button
								type="button"
								class="tile"
								style:--module-color={moduleInfo(row.id)?.color}
								aria-label="Pick up {displayName(row.id)}"
								onpointerenter={() => sound.play('hover')}
								onclick={(e) => {
									e.stopPropagation();
									clickTile(row.node);
								}}
							>
								<ItemIcon id={row.id} scale={2} />
							</button>
							{#if !grid.carried}
								<button
									type="button"
									class="tile-edit"
									aria-label="Edit {displayName(row.id)}"
									onclick={(e) => {
										e.stopPropagation();
										sound.play('click');
										onedit(row.node);
									}}
								>
									<!-- Drawn, like the badge glyphs: a text glyph neither centres
									     nor scales cleanly at this size. -->
									<svg viewBox="0 0 12 12" aria-hidden="true">
										<path d="M1 11v-3l7-7 3 3-7 7H1z" />
									</svg>
								</button>
								<CloseBadge
									class="tile-remove"
									label="Remove {displayName(row.id)} from the vault"
									onclick={() => grid.deleteVaultModule(row.node)}
								/>
							{/if}
						</div>
					{/each}
				</div>
			{/each}
		</div>
		<ScrollBar scroller={body} contained />
	</div>

	{#if hoveredModule && !grid.carried}
		<div class="dock-card" style:top="{hovered!.top}px">
			<GridHoverCard module={hoveredModule} level={1} badge={null} />
		</div>
	{/if}
</aside>

<style>
	.dock {
		position: relative;
		display: flex;
		flex-direction: column;
		width: 19rem;
		flex: none;
		border-left: 2px solid var(--color-edge-dim);
		background-color: var(--color-card);
	}
	/* Carrying, the whole dock reads as the place a module can be filed away. */
	.dock.is-target {
		border-left-color: var(--color-accent);
	}

	.dock-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		flex: none;
		padding: 0.75rem 1rem;
		border-bottom: 2px solid var(--color-edge-dim);
	}

	/* The same scroller shape as a dialog body: native bar hidden, the app's
	   own ScrollBar drawn over the box (see docs/design.md). */
	.dock-scroll {
		position: relative;
		display: flex;
		flex: 1;
		min-height: 0;
	}
	.dock-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 0.75rem 1rem 1.5rem;
		scrollbar-width: none;
	}
	.dock-body::-webkit-scrollbar {
		display: none;
	}

	.tile-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.5rem;
		margin: 0.5rem 0 1rem;
	}

	.tile-wrap {
		position: relative;
	}

	.tile {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		aspect-ratio: 1;
		background-color: var(--color-void);
		border: 2px solid
			color-mix(in srgb, var(--module-color, var(--color-edge)) 55%, var(--color-void));
		cursor: pointer;
	}
	.tile:hover {
		border-color: var(--module-color, var(--color-accent));
	}

	/* Both hover affordances sit on the tile's top corners, clear of its centre —
	   the click a tile exists for must never land on a revealed chip. */
	.tile-edit {
		position: absolute;
		left: 0;
		top: 0;
		display: none;
		width: 16px;
		height: 16px;
		padding: 3px;
		color: var(--color-ink);
		background-color: var(--color-void);
		border: 1px solid var(--color-edge);
		cursor: pointer;
	}
	.tile-edit svg {
		display: block;
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.tile-wrap:hover .tile-edit {
		display: block;
	}
	.tile-edit:hover {
		border-color: var(--color-accent);
		color: var(--color-accent);
	}

	.tile-wrap :global(.tile-remove) {
		position: absolute;
		top: 0;
		right: 0;
		display: none;
	}
	.tile-wrap:hover :global(.tile-remove) {
		display: block;
	}

	/* The info card floats out over the canvas, beside the hovered tile. */
	.dock-card {
		position: absolute;
		right: 100%;
		margin-right: 0.75rem;
		z-index: 10;
		pointer-events: none;
	}
</style>
