<script lang="ts">
	import { CONNECTION_SIDES, type ConnectionKey } from '$lib/save/vault';
	import { sound } from '$lib/sound.svelte';

	// The N/E/S/W connection cells a module card edits — shared by the vault
	// cards and the grid editor's module dialog so the two stay one control.
	// A cell is a stateful toggle rather than a `Button`, so — like the tank
	// bars and the wheel — it plays its own sound instead of inheriting one.
	let {
		connections,
		name,
		ontoggle
	}: {
		connections: Record<ConnectionKey, boolean>;
		/** The module's display name, for the cells' accessible labels. */
		name: string;
		ontoggle: (key: ConnectionKey) => void;
	} = $props();

	function toggle(key: ConnectionKey) {
		sound.play('close');
		ontoggle(key);
	}
</script>

<div class="conn-row">
	{#each CONNECTION_SIDES as side (side.key)}
		<button
			type="button"
			class="conn-cell punk-frame {connections[side.key] ? 'is-on' : ''}"
			aria-pressed={connections[side.key]}
			aria-label="{side.label} connection of {name}"
			onclick={() => toggle(side.key)}
		>
			{side.label}
		</button>
	{/each}
</div>

<style>
	.conn-row {
		display: flex;
		gap: 0.375rem;
	}

	/* Connection toggles wear the game's own control frame: dim at rest, the accent
	   when the side is wired up. The box is roomy enough that the letter clears the
	   frame on every side. */
	.conn-cell {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: calc(12 * var(--u));
		height: calc(12 * var(--u));
		font-family: var(--font-title);
		font-size: var(--text-hud-xs); /* the HUD face blurs off its 5px grid */
		line-height: 1;
		letter-spacing: normal;
		/* 8-bit HUD hangs a full brick of empty space on each glyph's right (advance
		   7, ink 6), so flex-centring the letter leaves it sitting left of centre.
		   Padding the left pushes the letter back to the middle of the box (a
		   padding shift moves centred content by half its width). */
		padding-left: round(0.2em, 1px);
		color: var(--color-muted);
		--frame: var(--color-edge-dim);
		--frame-fill: var(--color-void);
		background-color: transparent;
		border: 0;
		cursor: pointer;
	}
	.conn-cell:hover {
		--frame: var(--color-edge);
	}
	.conn-cell.is-on {
		--frame: var(--color-accent);
		color: var(--color-accent);
	}
</style>
