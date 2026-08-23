<script lang="ts">
	import CloseBadge from '../CloseBadge.svelte';
	import ScrollBar from '../ScrollBar.svelte';
	import EditChip from './EditChip.svelte';
	import GridHoverCard from './GridHoverCard.svelte';
	import GridModuleTile from './GridModuleTile.svelte';
	import type { GridEditorState } from '$lib/editor/grid.svelte';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { displayName } from '$lib/game/data';
	import { GRID_CELL } from '$lib/game/grid-icons';
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

	let dock = $state<HTMLElement | null>(null);
	let body = $state<HTMLElement | null>(null);
	let hovered = $state.raw<{ node: OdinNode; top: number } | null>(null);

	// Snapshot per edit (the raw-tree rule); the module a carry took out of the
	// vault keeps its slot in the list — the tree still holds it — but hides,
	// the same way a carried grid tile leaves its cell empty.
	const rows = $derived.by(() => {
		if (editor.version < 0 || !editor.slot) return [];
		return getModules(editor.slot.vault)
			.map((m) => ({ node: m, id: m.moduleDataId as string | null, module: readModule(m) }))
			.filter(({ node }) => !(grid.carried?.source === 'vault' && grid.carried.node === node));
	});
	const groups = $derived(groupModules(rows));

	// The dock draws the canvas's own tiles at the canvas's own default zoom, so
	// a module reads here exactly as it does on the board — one `u` feeds the
	// whole tile, art included. Three of them across is what the dock's width
	// allows at that size.
	const VAULT_U = 3;
	const VAULT_COLUMNS = 3;

	const hoveredModule = $derived(hovered ? readModule(hovered.node) : null);

	function hoverTile(node: OdinNode, e: PointerEvent) {
		const dockTop = dock?.getBoundingClientRect().top ?? 0;
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

<aside class="dock" class:is-target={!!grid.carried} bind:this={dock}>
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
				<div
					class="tile-grid"
					style:--cell="{GRID_CELL * VAULT_U}px"
					style:--columns={VAULT_COLUMNS}
				>
					{#each group.items as row (row.node)}
						<div class="tile-wrap" role="presentation" onpointerenter={(e) => hoverTile(row.node, e)}>
							<button
								type="button"
								class="tile"
								aria-label="Pick up {displayName(row.id)}"
								onpointerenter={() => sound.play('hover')}
								onclick={(e) => {
									e.stopPropagation();
									clickTile(row.node);
								}}
							>
								<GridModuleTile module={row.module} u={VAULT_U} />
							</button>
							{#if !grid.carried}
								<EditChip
									class="tile-edit"
									label="Edit {displayName(row.id)}"
									onclick={() => onedit(row.node)}
								/>
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

	<footer class="dock-foot">
		<!-- The inverted face of game-parity validation: unchecked (the default)
		     refuses rule-breaking drops exactly as the game does; checked, drops
		     always land and the canvas marks every broken rule instead — safe,
		     because the game never re-checks a loaded save. -->
		<label class="rules-toggle">
			<input
				type="checkbox"
				class="punk-check"
				checked={!grid.strict}
				onchange={(e) => (grid.strict = !e.currentTarget.checked)}
			/>
			Ignore placement rules
		</label>
	</footer>

	{#if hovered && hoveredModule && !grid.carried}
		<div class="dock-card" style:top="{hovered.top}px">
			<GridHoverCard module={hoveredModule} level={1} badge={null} />
		</div>
	{/if}
</aside>

<style>
	.dock {
		position: relative;
		display: flex;
		flex-direction: column;
		/* Wide enough for the footer's toggle to stay on one line — the tile grid
		   would happily be narrower. */
		width: 22rem;
		flex: none;
		border-left: 2px solid var(--color-edge-dim);
		background-color: var(--color-card);
	}
	/* Carrying, the whole dock reads as the place a module can be filed away —
	   and lights up once the module is actually over it. */
	.dock.is-target {
		border-left-color: var(--color-accent);
	}
	.dock.is-target:hover {
		background-color: color-mix(in srgb, var(--color-accent) 10%, var(--color-card));
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
		grid-template-columns: repeat(var(--columns), var(--cell));
		justify-content: space-between;
		gap: 0.25rem;
		margin: 0.5rem 0 1rem;
	}

	.tile-wrap {
		position: relative;
	}

	.tile {
		position: relative;
		width: var(--cell);
		height: var(--cell);
		cursor: pointer;
	}
	/* The frame already wears the module's colour, so hovering draws the box the
	   game's vault puts around the tile under the cursor. */
	.tile:hover {
		outline: 2px solid var(--color-edge);
	}

	/* Both hover affordances sit on the tile's top corners, clear of its centre —
	   the click a tile exists for must never land on a revealed chip. */
	.tile-wrap :global(.tile-edit) {
		position: absolute;
		left: 0;
		top: 0;
		display: none;
	}
	.tile-wrap:hover :global(.tile-edit) {
		display: block;
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

	.dock-foot {
		display: flex;
		justify-content: center;
		flex: none;
		padding: 0.75rem 1rem;
		border-top: 2px solid var(--color-edge-dim);
	}

	.rules-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		white-space: nowrap;
		font-size: var(--text-ui-xs);
		line-height: var(--text-ui-xs--line-height);
		text-transform: uppercase;
		color: var(--color-muted);
		cursor: pointer;
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
