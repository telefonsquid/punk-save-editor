<script lang="ts">
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import ModuleList, { type ModuleItem } from './ModuleList.svelte';
	import TextInput from './TextInput.svelte';
	import { displayName, moduleCategory, moduleInfo, type EffectField } from '$lib/game/data';
	import type { FieldKind } from '$lib/game/module-groups';
	import type { NewModuleFields } from '$lib/save/vault';

	let {
		open = $bindable(false),
		ids,
		onadd
	}: {
		open?: boolean;
		/** Module ids that may be added. */
		ids: string[];
		onadd: (id: string, fields: NewModuleFields) => void;
	} = $props();

	let query = $state('');

	// Shape choices made while browsing. They are transient on purpose: nothing
	// exists to change yet, so a pick only means anything once the row's Add
	// button turns it into a module. Keyed by module id, dropped when the dialog
	// closes.
	let picked = $state<Record<string, Partial<Record<FieldKind, EffectField>>>>({});

	const items = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return ids
			.filter(
				(id) =>
					!needle ||
					displayName(id).toLowerCase().includes(needle) ||
					moduleCategory(id).toLowerCase().includes(needle)
			)
			.map((id): ModuleItem => {
				// Show the shape this row would be added with: the pick if there is
				// one, else the asset's first candidate — which is exactly what
				// `addModule` falls back to.
				const info = moduleInfo(id);
				const sel = picked[id] ?? {};
				const shape = (chosen: EffectField | undefined, fallback: EffectField | undefined) =>
					[chosen ?? fallback].filter((f) => f !== undefined);
				return {
					key: id,
					id,
					fields: {
						powerCores: shape(sel.powerCores, info?.powerCores[0]),
						levelFields: shape(sel.levelFields, info?.levelFields[0])
					}
				};
			});
	});

	function chooseField(item: ModuleItem, kind: FieldKind, field: EffectField) {
		if (!item.id) return;
		picked[item.id] = { ...picked[item.id], [kind]: field };
	}

	function add(id: string | null) {
		if (!id) return;
		const sel = picked[id] ?? {};
		const fields: NewModuleFields = {};
		if (sel.powerCores) fields.powerCore = sel.powerCores;
		if (sel.levelFields) fields.levelModificationField = sel.levelFields;
		onadd(id, fields);
		open = false;
	}
</script>

<Dialog
	bind:open
	title="Add a module"
	width="56rem"
	onclose={() => {
		query = ''; // a stale filter would hide most of the list on reopen
		picked = {}; // shape picks belong to the browsing session, not the next one
	}}
>
	{#snippet header()}
		<TextInput
			type="search"
			class="ml-auto w-56 text-ui-xs"
			placeholder="Filter…"
			aria-label="Filter modules"
			bind:value={query}
		/>
		<Button variant="ghost" size="sm" onclick={() => (open = false)}>Close</Button>
	{/snippet}

	<ModuleList {items} empty="No module matches that filter." onfieldchange={chooseField}>
		{#snippet actions(item)}
			<Button variant="primary" size="xs" onclick={() => add(item.id)}>Add</Button>
		{/snippet}
	</ModuleList>

	{#snippet footer()}
		<p class="text-ui-xs text-muted">
			Added with all four connections and the module's highest power-core capacity. Picking a shape
			here only applies to the module you then add.
		</p>
	{/snippet}
</Dialog>
