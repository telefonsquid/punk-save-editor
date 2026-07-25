<script module lang="ts">
	import type { EffectField } from '$lib/game/data';

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

	/** The two kinds of effect field, named as `ModuleInfo` and `ModuleItem` hold them. */
	export type FieldKind = 'powerCores' | 'levelFields';

	const KINDS: { key: FieldKind; label: string }[] = [
		{ key: 'powerCores', label: 'POWERS' },
		{ key: 'levelFields', label: 'BOOSTS' }
	];
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import EffectFieldChooser from './EffectFieldChooser.svelte';
	import EffectFieldGrid from './EffectFieldGrid.svelte';
	import ItemIcon from './ItemIcon.svelte';
	import ResourceIcon from './ResourceIcon.svelte';
	import RichText from './RichText.svelte';
	import { assets, categoryRank, displayName, moduleInfo, resourceRank } from '$lib/game/data';
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

	/**
	 * Grouped by the module's own `ModuleType` asset, in the game's shop order —
	 * except for the two core categories, which `categoryRank` pins to the top —
	 * so weapons/gadgets/ship modules/weapon mods stay separated the way the
	 * player sees them in-game. A module whose type is missing lands in "OTHER".
	 *
	 * Inside a category the resource comes first and the name only breaks ties:
	 * a player looking for a weapon is choosing which resource to spend long
	 * before they care what it is called, and it keeps each resource's modules
	 * adjacent and uniformly coloured.
	 */
	const groups = $derived.by(() => {
		const by: Record<string, { name: string; rank: number; items: ModuleItem[] }> = {};
		for (const item of items) {
			const type = moduleInfo(item.id)?.type;
			const name = type?.name ?? 'OTHER';
			(by[name] ??= { name, rank: categoryRank(name, type?.order ?? 99), items: [] }).items.push(
				item
			);
		}
		for (const group of Object.values(by)) {
			group.items.sort(
				(a, b) =>
					resourceRank(moduleInfo(a.id)?.resource) - resourceRank(moduleInfo(b.id)?.resource) ||
					displayName(a.id).localeCompare(displayName(b.id))
			);
		}
		return Object.values(by).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
	});

	/**
	 * The effect fields to draw under a row, one entry per kind the module's asset
	 * defines: `shapes` is what it projects now (its own rolled shape when the
	 * caller passed one, else the asset's candidates) and `candidates` is what it
	 * could project, which is what the chooser offers.
	 */
	function fieldsOf(item: ModuleItem) {
		const info = moduleInfo(item.id);
		return KINDS.map((kind) => {
			const candidates = info?.[kind.key] ?? [];
			return { ...kind, candidates, shapes: item.fields?.[kind.key] ?? candidates };
		}).filter((kind) => kind.candidates.length > 0);
	}
</script>

{#if items.length === 0}
	<p class="text-ui-xs text-muted">{empty}</p>
{:else}
	{#each groups as group (group.name)}
		<h3 class="module-group">
			{group.name}
			<span class="module-group-count">({group.items.length})</span>
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
							<p class="row-desc punk-desc-shadow"><RichText text={info.description} /></p>
						{/if}
						<!-- Power cores and boosters act on the slots *around* them, so the
						     shape of that area is the most important thing about them —
						     the game shows the same diagram on their card. More than one
						     means the module rolls a random shape when it is built. -->
						{#each fieldsOf(item) as kind (kind.key)}
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
									<span class="row-stat punk-desc-shadow">
										{stat.label}
										<span class="row-stat-val">{stat.value}</span>
										{#if stat.resource}
											<span class="row-stat-icon"><ResourceIcon id={stat.resource} labeled /></span>
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
	/* Category heading in the HUD face, matched to the Modules tab's own group
	   headings so the picker reads as the same surface. */
	.module-group {
		font-family: var(--font-title);
		font-size: var(--text-hud-sm);
		line-height: var(--text-hud-sm--line-height);
		letter-spacing: var(--tracking-hud-wide);
		text-transform: uppercase;
		color: var(--color-muted);
		margin: 1.25rem 0 0.5rem;
	}
	.module-group:first-child {
		margin-top: 0;
	}
	.module-group-count {
		color: var(--color-edge);
	}

	/* Rows sit apart on the game's quiet edge line rather than a cold zinc rule. */
	.module-rows > li + li {
		border-top: 2px solid var(--color-edge-dim);
	}

	.row-name {
		font-size: var(--text-ui-xs);
		color: var(--color-ink);
	}

	/* The description is the game's own lowercase body copy, in the DOS face the
	   card uses for it. */
	.row-desc {
		margin-top: 0.25rem;
		font-family: var(--font-desc);
		font-size: 18px;
		line-height: 1.35;
		letter-spacing: normal;
		color: var(--color-stone);
	}

	/* Stats share the description's DOS face, forced uppercase like the game's card. */
	.row-stat {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-family: var(--font-desc);
		font-size: 18px;
		line-height: 1.35;
		letter-spacing: normal;
		text-transform: uppercase;
		color: var(--color-stone);
	}
	.row-stat-val {
		color: var(--color-ink);
	}
	/* The stat words are uppercase, so their ink sits in the top of the line box
	   while the empty descender space pads the bottom. Centring the pixel icon in
	   that box would drop it below the letters, so nudge it up onto the caps. */
	.row-stat-icon {
		display: inline-flex;
		transform: translateY(-2px);
	}
</style>
