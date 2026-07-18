<script lang="ts">
	import RawTree from './RawTree.svelte';
	import { META_KEYS } from '$lib/save/odin';
	import type { OdinNode, OdinPrimitiveArray, OdinRef, OdinValue } from '$lib/save/odin';
	import { assets } from '$lib/game/data';

	interface Props {
		/** Object or array holding the value, so scalar edits can be written back. */
		container: Record<string, unknown> | unknown[];
		key: string | number;
		label: string;
		ondirty: () => void;
	}

	let { container, key, label, ondirty }: Props = $props();

	// The containers are raw (non-reactive) save-tree objects; keep a local
	// reactive mirror of the value so scalar edits update the UI, while set()
	// writes through to the actual tree the serializer reads. container/key
	// never change for a given tree node, so capturing them once is intended.
	// svelte-ignore state_referenced_locally
	let value = $state.raw((container as Record<string | number, unknown>)[key] as OdinValue);

	const kind = $derived.by(() => {
		if (value === null) return 'null';
		if (Array.isArray(value)) return 'array';
		if (typeof value === 'object') {
			if ('$ref' in value) return 'ref';
			if ('$primitiveArray' in value) return 'binary';
			return 'node';
		}
		return typeof value; // string | number | bigint | boolean
	});

	let open = $state(false);
	let limit = $state(100);

	function childKeys(node: OdinNode): string[] {
		return Object.keys(node).filter((k) => !META_KEYS.has(k));
	}

	/** "EntityData+Memento, Punk.Main" -> "EntityData+Memento" */
	function shortType(node: OdinNode): string | null {
		return node.$type ? node.$type.split(',')[0] : null;
	}

	function prettyKey(k: string): string {
		return /^\$\d+$/.test(k) ? `#${k.slice(1)}` : k;
	}

	function set(v: unknown) {
		(container as Record<string | number, unknown>)[key] = v;
		value = v as OdinValue;
		ondirty();
	}

	function setNumber(e: Event) {
		const n = Number((e.currentTarget as HTMLInputElement).value);
		if (Number.isFinite(n)) set(n);
	}

	function setBigint(e: Event) {
		try {
			set(BigInt((e.currentTarget as HTMLInputElement).value));
		} catch {
			/* keep previous value while the text is not a valid integer */
		}
	}

	const assetHint = $derived(
		typeof value === 'string' ? (assets[value]?.displayName ?? null) : null
	);
</script>

{#if kind === 'node' || kind === 'array'}
	<details
		class="border-l border-zinc-800 pl-3"
		ontoggle={(e) => (open = e.currentTarget.open)}
	>
		<summary class="cursor-pointer py-0.5 text-sm text-zinc-300 select-none hover:text-lime-400">
			{label}
			{#if kind === 'array'}
				<span class="text-xs text-zinc-500">[{(value as OdinValue[]).length}]</span>
			{:else if shortType(value as OdinNode)}
				<span class="text-xs text-zinc-600">{shortType(value as OdinNode)}</span>
			{/if}
		</summary>
		{#if open}
			{#if kind === 'array'}
				{#each (value as OdinValue[]).slice(0, limit), i (i)}
					<RawTree container={value as unknown[]} key={i} label={`[${i}]`} {ondirty} />
				{/each}
				{#if (value as OdinValue[]).length > limit}
					<button
						class="my-1 rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:border-lime-400 hover:text-lime-400"
						onclick={() => (limit += 500)}
					>
						Show more ({(value as OdinValue[]).length - limit} hidden)
					</button>
				{/if}
			{:else}
				{#each childKeys(value as OdinNode) as k (k)}
					<RawTree
						container={value as Record<string, unknown>}
						key={k}
						label={prettyKey(k)}
						{ondirty}
					/>
				{/each}
			{/if}
		{/if}
	</details>
{:else}
	<div class="flex items-center gap-3 border-l border-zinc-800 py-0.5 pl-3 text-sm">
		<span class="min-w-32 text-zinc-400">{label}</span>
		{#if kind === 'number'}
			<input
				type="number"
				step="any"
				class="w-40 rounded border-zinc-700 bg-zinc-900 px-2 py-0.5 text-right text-sm"
				value={value as number}
				oninput={setNumber}
			/>
		{:else if kind === 'bigint'}
			<input
				type="text"
				class="w-40 rounded border-zinc-700 bg-zinc-900 px-2 py-0.5 text-right text-sm"
				value={(value as bigint).toString()}
				oninput={setBigint}
			/>
		{:else if kind === 'boolean'}
			<input
				type="checkbox"
				class="rounded border-zinc-700 bg-zinc-900"
				checked={value as boolean}
				onchange={(e) => set(e.currentTarget.checked)}
			/>
		{:else if kind === 'string'}
			<input
				type="text"
				class="w-72 rounded border-zinc-700 bg-zinc-900 px-2 py-0.5 text-sm"
				value={value as string}
				oninput={(e) => set(e.currentTarget.value)}
			/>
			{#if assetHint}
				<span class="text-xs text-fuchsia-400">{assetHint}</span>
			{/if}
		{:else if kind === 'ref'}
			<span class="text-xs text-zinc-500">→ internal ref #{(value as OdinRef).$ref}</span>
		{:else if kind === 'binary'}
			<span class="text-xs text-zinc-500">
				binary · {(value as OdinPrimitiveArray).data.length /
					(value as OdinPrimitiveArray).bytesPerElement} ×
				{(value as OdinPrimitiveArray).bytesPerElement} B (not editable)
			</span>
		{:else}
			<span class="text-xs text-zinc-600 italic">null</span>
		{/if}
	</div>
{/if}
