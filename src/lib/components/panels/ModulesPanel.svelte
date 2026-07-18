<script lang="ts">
	import Button from '../Button.svelte';
	import ModuleList, { type FieldKind, type ModuleItem } from '../ModuleList.svelte';
	import ModulePicker from '../ModulePicker.svelte';
	import NumberInput from '../NumberInput.svelte';
	import Section from '../Section.svelte';
	import { numInput } from '$lib/editor/inputs';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { displayName, equippableModules, usesPowerCore, type EffectField } from '$lib/game/data';
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
	} from '$lib/save/slot';

	let { editor }: { editor: EditorState } = $props();

	// The add-module picker is a modal over the same list component the vault uses.
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
	// The shared list only needs identity; `key` is the vault index, which the
	// actions snippet uses to find the editable row back in `moduleRows`.
	const moduleItems = $derived(
		moduleRows.map((row) => ({ key: row.index, id: row.id, fields: row.fields }))
	);

	/** Flips one grid connection of a module in the raw tree. */
	function toggleConnection(m: ModuleView, key: ConnectionKey) {
		m[key] = !m[key];
		editor.markCurated();
		editor.refresh();
	}

	/** The list's own vocabulary for the two fields, in memento terms. */
	const MEMENTO_KEY: Record<FieldKind, EffectFieldKey> = {
		powerCores: 'powerCore',
		levelFields: 'levelModificationField'
	};

	/** Rewrites the shape a vault module projects, in the raw tree. */
	function setField(item: ModuleItem, kind: FieldKind, field: EffectField) {
		if (!editor.slot) return;
		const row = moduleRows[item.key as number];
		setSavedEffectField(editor.slot.vault, row.module, MEMENTO_KEY[kind], field);
		editor.markCurated();
		editor.refresh();
	}

	function addModuleToVault(id: string, fields: NewModuleFields) {
		if (!editor.slot || !id) return;
		addModule(editor.slot.vault, id, fields);
		editor.markCurated();
		editor.refresh();
	}

	function removeModuleAt(index: number) {
		if (!editor.slot) return;
		removeModule(editor.slot.vault, index);
		editor.markCurated();
		editor.refresh();
	}
</script>

<Section title="Vault · Modules" class="md:col-span-2">
	<ModuleList items={moduleItems} empty="Vault has no modules." onfieldchange={setField}>
		{#snippet actions(item)}
			{@const row = moduleRows[item.key as number]}
			<div class="flex gap-1">
				{#each CONNECTION_SIDES as side (side.key)}
					<button
						type="button"
						class="h-7 w-7 rounded border text-xs font-semibold {row.connections[side.key]
							? 'border-lime-400 bg-lime-400/20 text-lime-300'
							: 'border-zinc-700 text-zinc-600 hover:border-zinc-500'}"
						aria-pressed={row.connections[side.key]}
						aria-label="{side.label} connection of {displayName(row.id)}"
						onclick={() => toggleConnection(row.module, side.key)}
					>
						{side.label}
					</button>
				{/each}
			</div>
			<!-- Power cores only apply to weapons and gadgets; ship modules and
			     weapon mods have no core, so the field would be dead there. -->
			{#if usesPowerCore(row.id)}
				<label class="flex items-center gap-1 text-xs text-zinc-500">
					Cores
					<NumberInput
						class="w-16"
						min="0"
						value={row.powerLevel}
						oninput={numInput(row.module, 'powerLevel')}
					/>
				</label>
			{/if}
			<Button
				variant="danger"
				size="xs"
				aria-label="Remove {displayName(row.id)} from the vault"
				onclick={() => removeModuleAt(row.index)}
			>
				Remove
			</Button>
		{/snippet}
	</ModuleList>
	<div class="mt-4 flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-3">
		<Button size="sm" onclick={() => (pickerOpen = true)}>Add a module…</Button>
		<span class="text-xs text-zinc-600">
			Browse every equippable module, grouped the way the game groups them.
		</span>
	</div>
	<ModulePicker bind:open={pickerOpen} ids={addableModuleIds} onadd={addModuleToVault} />
</Section>
