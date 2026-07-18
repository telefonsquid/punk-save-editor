<script lang="ts">
	import Button from '../Button.svelte';
	import ModuleList from '../ModuleList.svelte';
	import ModulePicker from '../ModulePicker.svelte';
	import NumberInput from '../NumberInput.svelte';
	import Section from '../Section.svelte';
	import { numInput } from '$lib/editor/inputs';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { displayName, equippableModules, usesPowerCore } from '$lib/game/data';
	import {
		addModule,
		CONNECTION_SIDES,
		getModules,
		removeModule,
		type ConnectionKey,
		type ModuleView
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
			connections: Object.fromEntries(
				CONNECTION_SIDES.map(({ key }) => [key, m[key]])
			) as Record<ConnectionKey, boolean>
		}));
	});
	// The shared list only needs identity; `key` is the vault index, which the
	// actions snippet uses to find the editable row back in `moduleRows`.
	const moduleItems = $derived(moduleRows.map((row) => ({ key: row.index, id: row.id })));

	/** Flips one grid connection of a module in the raw tree. */
	function toggleConnection(m: ModuleView, key: ConnectionKey) {
		m[key] = !m[key];
		editor.markCurated();
		editor.refresh();
	}

	function addModuleToVault(id: string) {
		if (!editor.slot || !id) return;
		addModule(editor.slot.vault, id);
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
	<ModuleList items={moduleItems} empty="Vault has no modules.">
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
