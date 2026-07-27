<script lang="ts">
	import ResourceIcon from './ResourceIcon.svelte';
	import type { StatLine } from '$lib/game/module-stats';

	// One "+2 max Fuel" / "0.2 per shot" line, drawn the same wherever a module is
	// drawn — the vault's tooltip cards stack them as a list, the picker's rows lay
	// them out inline, and both print the identical line.
	//
	// A line that carries a resource renders that resource's HUD icon in place of
	// its name, which is what the game's own card does; `labeled` keeps the written
	// name for screen readers, since here the icon is all a sighted reader gets.
	let { stat }: { stat: StatLine } = $props();
</script>

<span class="punk-stat punk-desc-shadow">
	{stat.label}
	<span class="punk-stat-val">{stat.value}</span>
	{#if stat.resource}<span class="punk-stat-icon"><ResourceIcon id={stat.resource} labeled /></span
		>{/if}
	{#if stat.suffix}{stat.suffix}{/if}
</span>
