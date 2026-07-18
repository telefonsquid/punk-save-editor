<script module lang="ts">
	export interface ModuleItem {
		/** Stable key for the keyed each — a vault index, or the module id. */
		key: string | number;
		id: string | null;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import ItemIcon from './ItemIcon.svelte';
	import ResourceIcon from './ResourceIcon.svelte';
	import RichText from './RichText.svelte';
	import { assets, displayName, moduleInfo, resourceLabel } from '$lib/game/data';
	import { moduleStats } from '$lib/game/module-stats';

	let {
		items,
		actions,
		empty = 'No modules.'
	}: {
		items: ModuleItem[];
		/** Trailing controls for a row (edit fields, an add button). */
		actions?: Snippet<[ModuleItem]>;
		empty?: string;
	} = $props();

	/**
	 * Grouped by the module's own `ModuleType` asset, in the game's shop order, so
	 * weapons/gadgets/ship modules/weapon mods stay separated the way the player
	 * sees them in-game. A module whose type is missing lands in "OTHER".
	 */
	const groups = $derived.by(() => {
		const by: Record<string, { name: string; order: number; items: ModuleItem[] }> = {};
		for (const item of items) {
			const type = moduleInfo(item.id)?.type;
			const name = type?.name ?? 'OTHER';
			(by[name] ??= { name, order: type?.order ?? 99, items: [] }).items.push(item);
		}
		return Object.values(by).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
	});
</script>

{#if items.length === 0}
	<p class="text-sm text-zinc-500">{empty}</p>
{:else}
	{#each groups as group (group.name)}
		<h3 class="mt-4 mb-1 text-xs font-bold tracking-widest text-zinc-500 uppercase first:mt-0">
			{group.name}
			<span class="font-normal text-zinc-600">({group.items.length})</span>
		</h3>
		<ul class="divide-y divide-zinc-800/50">
			{#each group.items as item (item.key)}
				{@const info = moduleInfo(item.id)}
				{@const stats = moduleStats(item.id)}
				<li class="flex flex-wrap items-start gap-3 py-2">
					<!-- Modules share a ColorAsset with the resource they belong to,
					     which is what tints them in the game itself. -->
					<span
						class="w-1 shrink-0 self-stretch rounded-full"
						style:background-color={info?.color ?? '#52525b'}
					></span>
					<ItemIcon id={item.id} />
					<div class="min-w-48 flex-1">
						<div class="flex items-center gap-2">
							<span class="font-semibold" style:color={info?.color ?? undefined}>
								{displayName(item.id)}
							</span>
							{#if info?.resource}
								<!-- The resource this module belongs to, as its HUD icon. -->
								<ResourceIcon id={info.resource} />
								<span class="sr-only">{resourceLabel(info.resource)}</span>
							{/if}
							{#if item.id && assets[item.id]?.level}
								<span class="text-xs text-zinc-600">tier {assets[item.id].level}</span>
							{/if}
						</div>
						{#if info?.description}
							<p class="mt-0.5 text-xs leading-snug text-zinc-400">
								<RichText text={info.description} />
							</p>
						{/if}
						{#if stats.length > 0}
							<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
								{#each stats as stat, i (i)}
									<span class="flex items-center gap-1 text-zinc-500">
										{stat.label}
										<span class="font-semibold text-zinc-300">{stat.value}</span>
										{#if stat.resource}
											<ResourceIcon id={stat.resource} />
											<span class="sr-only">{resourceLabel(stat.resource)}</span>
										{/if}
										{#if stat.suffix}{stat.suffix}{/if}
									</span>
								{/each}
							</div>
						{/if}
					</div>
					{#if actions}
						<div class="flex items-center gap-2">{@render actions(item)}</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/each}
{/if}
