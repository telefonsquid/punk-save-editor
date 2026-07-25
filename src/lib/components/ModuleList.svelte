<script module lang="ts">
	import type { EffectField } from '$lib/game/data';
	import type { FieldKind } from '$lib/game/module-groups';

	export interface ModuleItem {
		/** Stable key for the keyed each — a vault index, or the module id. */
		key: string | number;
		id: string | null;
		/**
		 * The effect fields to draw for this row. Omit it and the row falls back
		 * to the asset's *candidate* shapes; a module that already exists in the
		 * save passes the single shape it rolled (see `savedEffectField`).
		 */
		fields?: Record<FieldKind, EffectField[]>;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import EffectFieldChooser from './EffectFieldChooser.svelte';
	import EffectFieldGrid from './EffectFieldGrid.svelte';
	import ItemIcon from './ItemIcon.svelte';
	import ResourceIcon from './ResourceIcon.svelte';
	import RichText from './RichText.svelte';
	import { assets, displayName, moduleInfo } from '$lib/game/data';
	import { groupModules, moduleFields } from '$lib/game/module-groups';
	import { moduleStats } from '$lib/game/module-stats';

	let {
		items,
		actions,
		empty = 'No modules.',
		onfieldchange
	}: {
		items: ModuleItem[];
		/** Trailing controls for a row (edit fields, an add button). */
		actions?: Snippet<[ModuleItem]>;
		empty?: string;
		/** Supply this to make the effect-field diagrams selectable. */
		onfieldchange?: (item: ModuleItem, kind: FieldKind, field: EffectField) => void;
	} = $props();

	const groups = $derived(groupModules(items));
</script>

{#if items.length === 0}
	<p class="text-ui-xs text-muted">{empty}</p>
{:else}
	{#each groups as group (group.name)}
		<h3 class="punk-group-title mt-5 mb-2 first:mt-0">
			{group.name}
			<span class="text-edge">({group.items.length})</span>
		</h3>
		<ul class="module-rows">
			{#each group.items as item (item.key)}
				{@const info = moduleInfo(item.id)}
				{@const stats = moduleStats(item.id)}
				<li class="flex flex-wrap items-start gap-3 py-3">
					<!-- Modules share a ColorAsset with the resource they belong to,
					     which is what tints them in the game itself. -->
					<span
						class="w-1 shrink-0 self-stretch"
						style:background-color={info?.color ?? 'var(--color-edge)'}
					></span>
					<ItemIcon id={item.id} />
					<div class="min-w-48 flex-1">
						<div class="flex items-center gap-2">
							<span class="row-name" style:color={info?.color ?? undefined}>
								{displayName(item.id)}
							</span>
							{#if info?.resource}
								<!-- The resource this module belongs to, as its HUD icon. -->
								<ResourceIcon id={info.resource} labeled />
							{/if}
							{#if item.id && assets[item.id]?.level}
								<span class="text-ui-xs text-edge">tier {assets[item.id].level}</span>
							{/if}
						</div>
						{#if info?.description}
							<p class="punk-game-desc punk-desc-shadow mt-1"><RichText text={info.description} /></p>
						{/if}
						<!-- Power cores and boosters act on the slots *around* them, so the
						     shape of that area is the most important thing about them —
						     the game shows the same diagram on their card. More than one
						     means the module rolls a random shape when it is built. -->
						{#each moduleFields(item.id, item.fields) as kind (kind.key)}
							{#if onfieldchange}
								<EffectFieldChooser
									candidates={kind.candidates}
									value={kind.shapes[0] ?? null}
									color={info?.color}
									label={kind.label}
									onchange={(field) => onfieldchange(item, kind.key, field)}
								/>
							{:else}
								<div class="mt-1.5 flex flex-wrap items-center gap-2">
									{#each kind.shapes as shape, i (i)}
										<EffectFieldGrid
											field={shape}
											color={info?.color}
											label="{kind.label} the highlighted slots around it"
										/>
									{/each}
								</div>
							{/if}
						{/each}
						{#if stats.length > 0}
							<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
								{#each stats as stat, i (i)}
									<span class="punk-stat punk-desc-shadow">
										{stat.label}
										<span class="punk-stat-val">{stat.value}</span>
										{#if stat.resource}
											<span class="punk-stat-icon"><ResourceIcon id={stat.resource} labeled /></span>
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

<style>
	/* Rows sit apart on the game's quiet edge line rather than a cold zinc rule. */
	.module-rows > li + li {
		border-top: 2px solid var(--color-edge-dim);
	}

	.row-name {
		font-size: var(--text-ui-xs);
		color: var(--color-ink);
	}
</style>
