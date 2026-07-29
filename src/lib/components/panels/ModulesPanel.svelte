<script lang="ts">
	import Button from '../Button.svelte';
	import CloseBadge from '../CloseBadge.svelte';
	import EffectFieldChooser from '../EffectFieldChooser.svelte';
	import ItemIcon from '../ItemIcon.svelte';
	import ModuleGroupHeading from '../ModuleGroupHeading.svelte';
	import ModulePicker from '../ModulePicker.svelte';
	import ModuleStatLine from '../ModuleStatLine.svelte';
	import NumberInput from '../NumberInput.svelte';
	import RichText from '../RichText.svelte';
	import Section from '../Section.svelte';
	import { reveal } from '$lib/actions/reveal';
	import { numInput } from '$lib/editor/inputs';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { displayName, equippableModules, usesPowerCore, type EffectField } from '$lib/game/data';
	import {
		groupModules,
		moduleCard,
		moduleFields,
		type FieldKind
	} from '$lib/game/module-groups';
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
	import { sound } from '$lib/sound.svelte';

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

	/**
	 * Flips one grid connection of a module in the raw tree. The cell is a
	 * stateful toggle rather than a `Button`, so — like the tank bars and the
	 * wheel — it plays its own sound instead of inheriting one.
	 */
	function toggleConnection(m: ModuleView, key: ConnectionKey) {
		m[key] = !m[key];
		sound.play('close');
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
			<ModuleGroupHeading name={group.name} count={group.items.length} class="mb-2" />
			<div class="module-grid mb-10">
				{#each group.items as row (row.index)}
					{@const card = moduleCard(row.id)}
					<!-- One module drawn as the game's own tooltip card (module_card.png):
					     coloured title, muted body, its effect diagram and stats — with the
					     bits the editor lets you change sitting in a quiet footer. -->
					<article class="module-card punk-slab" use:reveal>
						<CloseBadge
							class="absolute top-2 right-2"
							label="Remove {displayName(row.id)} from the vault"
							onclick={() => removeModuleAt(row.index)}
						/>

						<header class="card-head">
							<ItemIcon id={row.id} scale={2} />
							<h4
								class="card-name punk-panel-title punk-title-shadow"
								style:color={card.color ?? undefined}
							>
								{displayName(row.id)}{#if card.tier}<span class="card-tier">tier {card.tier}</span
									>{/if}
							</h4>
						</header>

						{#if card.info?.description}
							<p class="punk-game-desc punk-desc-shadow mt-2.5">
								<RichText text={card.info.description} />
							</p>
						{/if}

						{#if card.stats.length > 0}
							<!-- One stat per line so a card with several ("Explosion 1 dmg" then
							     "Cost 2 per shot") reads as a list, not a run-on. -->
							<ul class="card-stats">
								{#each card.stats as stat, i (i)}
									<li><ModuleStatLine {stat} /></li>
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
									color={card.color}
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

	/* The card itself is `punk-slab` — the game's module tooltip, which is the
	   same shell every Section wears. Only its own inset lives here. */
	.module-card {
		position: relative;
		padding: 1rem 1.25rem;
	}

	.card-head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		/* Keep the name clear of the remove cross. */
		padding-right: 1.25rem;
	}

	/* Module name in the panel-title shape, coloured by the module inline, at a
	   dedicated size 10% under `sm` — the way the reference sets a card title a
	   touch smaller than a section head. The drop shadow is `punk-title-shadow`
	   on the element; only the size is this card's own. */
	.card-name {
		font-size: var(--text-hud-sm-title);
		line-height: var(--text-hud-sm-title--line-height);
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
