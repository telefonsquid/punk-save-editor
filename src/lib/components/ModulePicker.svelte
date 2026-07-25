<script lang="ts">
	import Button from './Button.svelte';
	import ModuleList, { type FieldKind, type ModuleItem } from './ModuleList.svelte';
	import { displayName, moduleCategory, moduleInfo, type EffectField } from '$lib/game/data';
	import type { NewModuleFields } from '$lib/save/slot';

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

	let dialog = $state<HTMLDialogElement | null>(null);
	let query = $state('');

	// Shape choices made while browsing. They are transient on purpose: nothing
	// exists to change yet, so a pick only means anything once the row's Add
	// button turns it into a module. Keyed by module id, dropped when the dialog
	// closes.
	let picked = $state<Record<string, Partial<Record<FieldKind, EffectField>>>>({});

	// `showModal()` is what gives the native dialog its focus trap and Esc
	// handling, and there is no attribute equivalent — so the open state has to
	// drive the imperative call, and the element reference has to be bound. The
	// effect only touches the DOM; it assigns no state.
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

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

<!-- `m-auto` is what centres the dialog: the UA centres a modal with its own
     `margin: auto`, which Tailwind's preflight reset zeroes out. Square warm-black
     slab with the game's edge, same language as the editor's own cards. -->
<dialog
	bind:this={dialog}
	class="punk-dialog m-auto max-h-[85vh] w-[min(56rem,92vw)] border-2 border-edge bg-surface p-0 text-ink backdrop:bg-black/80"
	onclose={() => {
		open = false;
		query = ''; // a stale filter would hide most of the list on reopen
		picked = {}; // shape picks belong to the browsing session, not the next one
	}}
	onclick={(e) => {
		// A click that lands on the dialog element itself is the backdrop (its
		// content fills the box, so anything else has a child as its target).
		if (e.target === dialog) open = false;
	}}
>
	<div class="flex items-center gap-3 border-b-2 border-edge-dim px-5 py-3">
		<h2 class="font-title text-hud-sm tracking-hud-wide text-accent shrink-0 whitespace-nowrap uppercase">
			Add a module
		</h2>
		<input
			type="search"
			class="punk-search ml-auto w-56 text-ui-xs"
			placeholder="Filter…"
			aria-label="Filter modules"
			bind:value={query}
		/>
		<Button variant="ghost" size="sm" onclick={() => (open = false)}>Close</Button>
	</div>
	<div class="max-h-[70vh] overflow-y-auto px-5 py-4">
		<ModuleList {items} empty="No module matches that filter." onfieldchange={chooseField}>
			{#snippet actions(item)}
				<Button size="xs" onclick={() => add(item.id)}>Add</Button>
			{/snippet}
		</ModuleList>
	</div>
	<p class="border-t-2 border-edge-dim px-5 py-3 text-ui-xs text-muted">
		Added with all four connections and the module's highest power-core capacity. Picking a shape
		here only applies to the module you then add.
	</p>
</dialog>

<style>
	/* The filter box wears the game's quiet edge and clears @tailwindcss/forms'
	   white fill and blue focus ring, so it reads like the rest of the editor. */
	.punk-search {
		border: 2px solid var(--color-edge-dim);
		background-color: var(--color-void);
		color: var(--color-ink);
		padding: 0.35rem 0.6rem;
	}
	.punk-search:focus {
		outline: none;
		box-shadow: none;
		border-color: var(--color-accent);
	}
	.punk-search::placeholder {
		color: var(--color-muted);
	}
</style>
