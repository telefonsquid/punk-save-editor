<script lang="ts">
	import ConnectionToggles from '../ConnectionToggles.svelte';
	import Dialog from '../Dialog.svelte';
	import EffectFieldChooser from '../EffectFieldChooser.svelte';
	import ItemIcon from '../ItemIcon.svelte';
	import NumberInput from '../NumberInput.svelte';
	import { numInput } from '$lib/editor/inputs';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { displayName, usesPowerCore, type EffectField } from '$lib/game/data';
	import { moduleFields, type FieldKind } from '$lib/game/module-groups';
	import type { OdinNode } from '$lib/save/odin';
	import {
		CONNECTION_SIDES,
		savedEffectField,
		setSavedEffectField,
		type ConnectionKey,
		type EffectFieldKey,
		type ModuleView
	} from '$lib/save/vault';

	// The card editor as a dialog: the same connections / shapes / cores the
	// vault cards edit in their footer, opened from the grid editor's EDIT chip
	// for one module wherever it lives. `file` says which save file the module's
	// node belongs to — the whole tree (for id allocation) and the dirty flag
	// both follow from it.
	let {
		editor,
		node,
		file,
		open = $bindable(false)
	}: {
		editor: EditorState;
		node: OdinNode | null;
		file: 'entities' | 'vault';
		open?: boolean;
	} = $props();

	const tree = $derived(
		file === 'entities' ? (editor.slot?.files.entities ?? null) : (editor.slot?.vault ?? null)
	);

	// Snapshot the scalars the template renders (the raw-tree rule): the node is
	// mutated in place, so the keyed views only move when `version` does.
	const row = $derived.by(() => {
		if (editor.version < 0 || !node) return null;
		const m = node as unknown as ModuleView;
		return {
			module: m,
			id: m.moduleDataId,
			powerLevel: m.powerLevel,
			fields: {
				powerCores: [savedEffectField(m.powerCore)].filter((f) => f !== null),
				levelFields: [savedEffectField(m.levelModificationField)].filter((f) => f !== null)
			},
			connections: Object.fromEntries(
				CONNECTION_SIDES.map(({ key }) => [key, m[key]])
			) as Record<ConnectionKey, boolean>
		};
	});

	const MEMENTO_KEY: Record<FieldKind, EffectFieldKey> = {
		powerCores: 'powerCore',
		levelFields: 'levelModificationField'
	};

	function setField(kind: FieldKind, field: EffectField) {
		if (!row || !tree) return;
		setSavedEffectField(tree, row.module, MEMENTO_KEY[kind], field);
		editor.touch(file);
	}

	function toggleConnection(key: ConnectionKey) {
		if (!row) return;
		row.module[key] = !row.module[key];
		editor.touch(file);
	}
</script>

{#if row}
	<Dialog bind:open title={displayName(row.id)} width="30rem">
		<div class="flex items-center gap-3 mb-4">
			<ItemIcon id={row.id} scale={2} />
			<p class="text-ui-xs text-muted">
				Changes land on this module immediately — the grid behind reflects them.
			</p>
		</div>

		<div class="flex flex-col gap-4">
			{#each moduleFields(row.id, row.fields) as kind (kind.key)}
				<EffectFieldChooser
					candidates={kind.candidates}
					value={kind.shapes[0] ?? null}
					label={kind.label}
					onchange={(field) => setField(kind.key, field)}
				/>
			{/each}

			<div class="flex flex-wrap items-end gap-6">
				<div class="flex flex-col gap-1.5">
					<span class="edit-label">Connections</span>
					<ConnectionToggles
						connections={row.connections}
						name={displayName(row.id)}
						ontoggle={toggleConnection}
					/>
				</div>
				{#if usesPowerCore(row.id)}
					<label class="flex flex-col gap-1.5">
						<span class="edit-label">Cores</span>
						<NumberInput
							class="w-16"
							min="0"
							value={row.powerLevel}
							oninput={numInput(editor, row.module, 'powerLevel', {
								min: 0,
								round: true,
								file
							})}
						/>
					</label>
				{/if}
			</div>
		</div>
	</Dialog>
{/if}

<style>
	.edit-label {
		font-size: var(--text-ui-xs);
		line-height: 1;
		text-transform: uppercase;
		color: var(--color-muted);
	}
</style>
