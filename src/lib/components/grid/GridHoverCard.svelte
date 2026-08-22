<script lang="ts">
	import EffectFieldGrid from '../EffectFieldGrid.svelte';
	import ItemIcon from '../ItemIcon.svelte';
	import ModuleStatLine from '../ModuleStatLine.svelte';
	import RichText from '../RichText.svelte';
	import { displayName, moduleCategory } from '$lib/game/data';
	import { moduleCard } from '$lib/game/module-groups';
	import type { GridModule } from '$lib/game/grid-rules';

	// The game's hover popup (HoveredModuleInfo): category, coloured name, boost
	// chevrons, description, the module's *rolled* effect field, stats — and the
	// attached-cores line under a main module. Read-only; editing opens the card
	// editor dialog instead.
	let {
		module,
		level,
		badge
	}: {
		module: GridModule;
		level: number;
		badge: { cores: number; budget: number } | null;
	} = $props();

	const card = $derived(moduleCard(module.id));
	// The rolled shape from the memento is the authority, not the asset's list.
	const field = $derived(module.powerCore ?? module.levelField);
</script>

<aside class="hover-card punk-slab">
	<header class="flex items-center gap-3">
		<ItemIcon id={module.id} scale={2} />
		<div class="min-w-0">
			<p class="punk-group-title">{moduleCategory(module.id)}</p>
			<h4
				class="punk-panel-title punk-title-shadow card-name"
				style:color={card.color ?? undefined}
			>
				{displayName(module.id)}
				{#if level > 1}<span class="boosts text-regen">+{level - 1}</span>{/if}
			</h4>
		</div>
	</header>

	{#if card.info?.description}
		<p class="punk-game-desc punk-desc-shadow mt-2.5"><RichText text={card.info.description} /></p>
	{/if}

	{#if field}
		<div class="mt-3"><EffectFieldGrid {field} color={card.color} /></div>
	{/if}

	{#if card.stats.length > 0}
		<ul class="card-stats">
			{#each card.stats as stat, i (i)}
				<li><ModuleStatLine {stat} /></li>
			{/each}
		</ul>
	{/if}

	{#if badge}
		<p class="power-line punk-stat">
			Attached power cores: <span class="punk-stat-val">{badge.cores}/{badge.budget}</span>
		</p>
	{/if}
</aside>

<style>
	.hover-card {
		width: 20rem;
		padding: 0.875rem 1rem;
		pointer-events: none;
	}

	.card-name {
		font-size: var(--text-hud-sm-title);
		line-height: var(--text-hud-sm-title--line-height);
		overflow-wrap: anywhere;
	}

	.boosts {
		margin-left: 0.5em;
		font-size: var(--text-hud-xs);
	}

	.card-stats {
		display: flex;
		flex-direction: column;
		margin-top: 0.75rem;
		list-style: none;
		padding: 0;
	}

	.power-line {
		margin-top: 0.5rem;
		color: var(--color-power);
	}
</style>
