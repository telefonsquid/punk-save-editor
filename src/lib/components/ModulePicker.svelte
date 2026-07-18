<script lang="ts">
	import ModuleList, { type ModuleItem } from './ModuleList.svelte';
	import { displayName, moduleCategory } from '$lib/game/data';

	let {
		open = $bindable(false),
		ids,
		onadd
	}: {
		open?: boolean;
		/** Module ids that may be added. */
		ids: string[];
		onadd: (id: string) => void;
	} = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let query = $state('');

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
			.map((id): ModuleItem => ({ key: id, id }));
	});

	function add(id: string | null) {
		if (!id) return;
		onadd(id);
		open = false;
	}
</script>

<!-- `m-auto` is what centres the dialog: the UA centres a modal with its own
     `margin: auto`, which Tailwind's preflight reset zeroes out. -->
<dialog
	bind:this={dialog}
	class="m-auto max-h-[85vh] w-[min(56rem,92vw)] rounded-lg border border-zinc-700 bg-zinc-900 p-0 text-zinc-200 backdrop:bg-black/70"
	onclose={() => {
		open = false;
		query = ''; // a stale filter would hide most of the list on reopen
	}}
>
	<div class="flex items-center gap-3 border-b border-zinc-800 px-5 py-3">
		<h2 class="text-sm font-bold tracking-widest text-fuchsia-400 uppercase">Add a module</h2>
		<input
			type="search"
			class="ml-auto w-56 rounded border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
			placeholder="Filter…"
			aria-label="Filter modules"
			bind:value={query}
		/>
		<button
			type="button"
			class="rounded border border-zinc-700 px-2 py-1 text-sm hover:border-zinc-500"
			onclick={() => (open = false)}
		>
			Close
		</button>
	</div>
	<div class="max-h-[70vh] overflow-y-auto px-5 py-3">
		<ModuleList {items} empty="No module matches that filter.">
			{#snippet actions(item)}
				<button
					type="button"
					class="rounded border border-zinc-700 px-3 py-1 text-xs font-semibold hover:border-lime-400 hover:text-lime-400"
					onclick={() => add(item.id)}
				>
					Add
				</button>
			{/snippet}
		</ModuleList>
	</div>
	<p class="border-t border-zinc-800 px-5 py-2 text-xs text-zinc-600">
		Added with all four connections and the module's highest power-core capacity.
	</p>
</dialog>
