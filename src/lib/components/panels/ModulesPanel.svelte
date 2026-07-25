<script lang="ts">
	import Button from '../Button.svelte';
	import EffectFieldChooser from '../EffectFieldChooser.svelte';
	import ItemIcon from '../ItemIcon.svelte';
	import ModulePicker from '../ModulePicker.svelte';
	import NumberInput from '../NumberInput.svelte';
	import ResourceIcon from '../ResourceIcon.svelte';
	import RichText from '../RichText.svelte';
	import Section from '../Section.svelte';
	import { reveal } from '$lib/actions/reveal';
	import { numInput } from '$lib/editor/inputs';
	import type { EditorState } from '$lib/editor/state.svelte';
	import {
		assets,
		displayName,
		equippableModules,
		moduleInfo,
		usesPowerCore,
		type EffectField
	} from '$lib/game/data';
	import { groupModules, moduleFields, type FieldKind } from '$lib/game/module-groups';
	import { moduleStats } from '$lib/game/module-stats';
	import {
		addModule,
		CONNECTION_SIDES,
		getModules,
		removeModule,
		savedEffectField,
		setSavedEffectField,
		type ConnectionKey,
		type EffectFieldKey,
		type ModuleView,
		type NewModuleFields
	} from '$lib/save/vault';

	let { editor }: { editor: EditorState } = $props();

	let pickerOpen = $state(false);
	const addableModuleIds = equippableModules().map(({ id }) => id);

	// A derived recompute reuses the underlying module nodes, so the keyed
	// {#each} would not notice an edited connection if the template read the node
	// directly. Snapshot every scalar the rows render into fresh objects.
	const moduleRows = $derived.by(() => {
		if (editor.version < 0 || !editor.slot) return [];
		return getModules(editor.slot.vault).map((m, index) => ({
			module: m,
			index,
			id: m.moduleDataId,
			powerLevel: m.powerLevel,
			// An owned module already rolled its shapes, so show those rather
			// than every shape the asset could have produced.
			fields: {
				powerCores: [savedEffectField(m.powerCore)].filter((f) => f !== null),
				levelFields: [savedEffectField(m.levelModificationField)].filter((f) => f !== null)
			},
			connections: Object.fromEntries(
				CONNECTION_SIDES.map(({ key }) => [key, m[key]])
			) as Record<ConnectionKey, boolean>
		}));
	});
	type ModuleRow = (typeof moduleRows)[number];

	// Same grouping and order as the picker's list — the shared rule lives in
	// $lib/game/module-groups.
	const groups = $derived(groupModules(moduleRows));

	const MEMENTO_KEY: Record<FieldKind, EffectFieldKey> = {
		powerCores: 'powerCore',
		levelFields: 'levelModificationField'
	};

	/** Flips one grid connection of a module in the raw tree. */
	function toggleConnection(m: ModuleView, key: ConnectionKey) {
		m[key] = !m[key];
		editor.touch('vault');
	}

	/** Rewrites the shape a vault module projects, in the raw tree. */
	function setField(row: ModuleRow, kind: FieldKind, field: EffectField) {
		if (!editor.slot) return;
		setSavedEffectField(editor.slot.vault, row.module, MEMENTO_KEY[kind], field);
		editor.touch('vault');
	}

	function addModuleToVault(id: string, fields: NewModuleFields) {
		if (!editor.slot || !id) return;
		addModule(editor.slot.vault, id, fields);
		editor.touch('vault');
	}

	function removeModuleAt(index: number) {
		if (!editor.slot) return;
		removeModule(editor.slot.vault, index);
		editor.touch('vault');
	}
</script>

<Section title="Vault Modules" plain>
	<!-- The one action for the whole tab sits right under the title, the way the
	     other panels put their add controls up top. -->
	<div class="flex justify-center mb-10">
		<Button size="sm" onclick={() => (pickerOpen = true)}>Add a module…</Button>
	</div>

	{#if moduleRows.length === 0}
		<p class="text-center text-muted text-ui-xs">Vault has no modules.</p>
	{:else}
		{#each groups as group (group.name)}
			<h3 class="punk-group-title mb-2">
				{group.name}
				<span class="text-edge">({group.items.length})</span>
			</h3>
			<div class="module-grid mb-10">
				{#each group.items as row (row.index)}
					{@const info = moduleInfo(row.id)}
					{@const stats = moduleStats(row.id)}
					{@const tier = row.id ? assets[row.id]?.level : undefined}
					<!-- One module drawn as the game's own tooltip card (module_card.png):
					     coloured title, muted body, its effect diagram and stats — with the
					     bits the editor lets you change sitting in a quiet footer. -->
					<article
						class="module-card"
						style:--card-accent={info?.color ?? 'var(--color-edge)'}
						use:reveal
					>
						<button
							type="button"
							class="card-x"
							aria-label="Remove {displayName(row.id)} from the vault"
							onclick={() => removeModuleAt(row.index)}
						>
							<svg viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
								<path d="M1 1l6 6M7 1l-6 6" />
							</svg>
						</button>

						<header class="card-head">
							<ItemIcon id={row.id} scale={2} />
							<h4 class="card-name" style:color={info?.color ?? undefined}>
								{displayName(row.id)}{#if tier}<span class="card-tier">tier {tier}</span>{/if}
							</h4>
						</header>

						{#if info?.description}
							<p class="punk-game-desc punk-desc-shadow mt-2.5"><RichText text={info.description} /></p>
						{/if}

						{#if stats.length > 0}
							<!-- One stat per line so a card with several ("Explosion 1 dmg" then
							     "Cost 2 per shot") reads as a list, not a run-on. -->
							<ul class="card-stats">
								{#each stats as stat, i (i)}
									<li class="punk-stat punk-desc-shadow">
										{stat.label}
										<span class="punk-stat-val">{stat.value}</span>
										{#if stat.resource}<span class="punk-stat-icon"><ResourceIcon id={stat.resource} labeled /></span>{/if}
										{#if stat.suffix}{stat.suffix}{/if}
									</li>
								{/each}
							</ul>
						{/if}

						<footer class="card-foot">
							<!-- The shape pickers moved down here next to the connection toggles:
							     both are things you change, so they live together below the line
							     rather than dressing up the game-card body above it. -->
							{#each moduleFields(row.id, row.fields) as kind (kind.key)}
								<EffectFieldChooser
									candidates={kind.candidates}
									value={kind.shapes[0] ?? null}
									color={info?.color}
									label={kind.label}
									onchange={(field) => setField(row, kind.key, field)}
								/>
							{/each}

							<div class="foot-controls">
								<div class="foot-group">
									<span class="foot-label">Connections</span>
									<div class="conn-row">
										{#each CONNECTION_SIDES as side (side.key)}
											<button
												type="button"
												class="conn-cell punk-frame {row.connections[side.key] ? 'is-on' : ''}"
												aria-pressed={row.connections[side.key]}
												aria-label="{side.label} connection of {displayName(row.id)}"
												onclick={() => toggleConnection(row.module, side.key)}
											>
												{side.label}
											</button>
										{/each}
									</div>
								</div>
								<!-- Power cores only apply to weapons and gadgets; ship modules and
								     weapon mods have no core, so the field is left off there. -->
								{#if usesPowerCore(row.id)}
									<label class="foot-group">
										<span class="foot-label">Cores</span>
										<NumberInput
											class="w-16"
											min="0"
											value={row.powerLevel}
											oninput={numInput(editor, row.module, 'powerLevel', {
												min: 0,
												round: true,
												file: 'vault'
											})}
										/>
									</label>
								{/if}
							</div>
						</footer>
					</article>
				{/each}
			</div>
		{/each}
	{/if}

	<ModulePicker bind:open={pickerOpen} ids={addableModuleIds} onadd={addModuleToVault} />
</Section>

<style>
	/* Two cards per row on anything but a phone. */
	.module-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
	}
	@media (min-width: 48rem) {
		.module-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	/* The card itself: the game's module tooltip — a warm near-black slab a shade
	   below the surface so it recedes from the panel, square-cornered, with the
	   flat grey edge sampled straight off module_card.png (rgb 48 40 34). */
	.module-card {
		position: relative;
		background-color: #120f0c;
		border: 2px solid rgb(48, 40, 34);
		padding: 1rem 1.25rem;
	}

	/* Remove is a bare cross in the top-right, dim until reached for. */
	.card-x {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		width: 1rem;
		height: 1rem;
		color: var(--color-muted);
		background: transparent;
		border: 0;
		padding: 0;
		cursor: pointer;
	}
	.card-x:hover {
		color: var(--color-danger);
	}
	.card-x svg {
		width: 100%;
		height: 100%;
	}

	.card-head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		/* Keep the name clear of the remove cross. */
		padding-right: 1.25rem;
	}

	/* Module name in 8-bit HUD with the game's hard right drop shadow, coloured by
	   the module inline. A dedicated size 10% under `sm`, the way the reference
	   sets the title a touch smaller than a section head. */
	.card-name {
		font-family: var(--font-title);
		font-size: var(--text-hud-sm-title);
		line-height: var(--text-hud-sm-title--line-height);
		letter-spacing: var(--tracking-hud-wide);
		text-transform: uppercase;
		text-shadow: 3px 0 0 #050403;
		overflow-wrap: anywhere;
	}

	/* Tier rides on the title line, in the quiet grey, without the title's caps
	   tracking or drop shadow. */
	.card-tier {
		margin-left: 0.6em;
		font-size: var(--text-hud-xs);
		letter-spacing: normal;
		color: var(--color-edge);
		text-shadow: none;
		white-space: nowrap;
	}

	.card-stats {
		display: flex;
		flex-direction: column;
		gap: 0;
		margin-top: 0.75rem;
		list-style: none;
		padding: 0;
	}

	/* The editor controls sit under a thin rule, kept apart from the game-card body
	   above them. Shape pickers first, then the toggles and cores below. */
	.card-foot {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 1rem;
		padding-top: 0.75rem;
		border-top: 2px solid var(--color-edge-dim);
	}
	.foot-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 1.5rem;
	}
	.foot-group {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	/* Control labels are quiet grey, not the accent the game keeps for its own
	   headings. */
	.foot-label {
		font-size: var(--text-ui-xs);
		line-height: 1;
		text-transform: uppercase;
		color: var(--color-muted);
	}

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
		font-size: 12px;
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
