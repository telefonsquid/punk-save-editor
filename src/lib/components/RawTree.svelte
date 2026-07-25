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
	<details class="raw-branch" ontoggle={(e) => (open = e.currentTarget.open)}>
		<summary class="raw-summary">
			{label}
			{#if kind === 'array'}
				<span class="raw-hint">[{(value as OdinValue[]).length}]</span>
			{:else if shortType(value as OdinNode)}
				<span class="raw-hint">{shortType(value as OdinNode)}</span>
			{/if}
		</summary>
		{#if open}
			{#if kind === 'array'}
				{#each (value as OdinValue[]).slice(0, limit), i (i)}
					<RawTree container={value as unknown[]} key={i} label={`[${i}]`} {ondirty} />
				{/each}
				{#if (value as OdinValue[]).length > limit}
					<button class="raw-more" onclick={() => (limit += 500)}>
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
	<div class="raw-leaf">
		<span class="raw-label">{label}</span>
		{#if kind === 'number'}
			<input
				type="number"
				step="any"
				class="raw-field w-40 text-right"
				value={value as number}
				oninput={setNumber}
			/>
		{:else if kind === 'bigint'}
			<input
				type="text"
				class="raw-field w-40 text-right"
				value={(value as bigint).toString()}
				oninput={setBigint}
			/>
		{:else if kind === 'boolean'}
			<input
				type="checkbox"
				class="raw-check"
				checked={value as boolean}
				onchange={(e) => set(e.currentTarget.checked)}
			/>
		{:else if kind === 'string'}
			<input
				type="text"
				class="raw-field w-72"
				value={value as string}
				oninput={(e) => set(e.currentTarget.value)}
			/>
			{#if assetHint}
				<span class="raw-asset">{assetHint}</span>
			{/if}
		{:else if kind === 'ref'}
			<span class="raw-hint">→ internal ref #{(value as OdinRef).$ref}</span>
		{:else if kind === 'binary'}
			<span class="raw-hint">
				binary · {(value as OdinPrimitiveArray).data.length /
					(value as OdinPrimitiveArray).bytesPerElement} ×
				{(value as OdinPrimitiveArray).bytesPerElement} B (not editable)
			</span>
		{:else}
			<span class="raw-null">null</span>
		{/if}
	</div>
{/if}

<style>
	/* The raw tree is the game's own data laid bare, but it still lives inside this
	   editor, so it wears the editor's warm palette and legible pixel face rather
	   than the cold zinc/lime it started as. */

	/* Nesting guide: a quiet warm rule down the left of each branch. */
	.raw-branch,
	.raw-leaf {
		border-left: 2px solid var(--color-edge-dim);
		padding-left: 0.75rem;
	}
	.raw-leaf {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding-block: 0.125rem;
	}

	.raw-summary {
		font-size: var(--text-ui-xs);
		line-height: var(--text-ui-xs--line-height);
		color: var(--color-stone);
		cursor: pointer;
		user-select: none;
		padding-block: 0.125rem;
	}
	.raw-summary:hover {
		color: var(--color-accent);
	}

	/* Keys read quiet; the value beside them is what the eye lands on. */
	.raw-label {
		min-width: 8rem;
		font-size: var(--text-ui-xs);
		line-height: var(--text-ui-xs--line-height);
		color: var(--color-muted);
	}
	/* Type names, lengths, refs and binary notes are all just annotations. */
	.raw-hint {
		font-size: var(--text-ui-xs);
		color: var(--color-edge);
	}
	.raw-null {
		font-size: var(--text-ui-xs);
		font-style: italic;
		color: var(--color-edge);
	}
	/* The asset a raw id points at, called out the way the game emphasises a word
	   mid-sentence. */
	.raw-asset {
		font-size: var(--text-ui-xs);
		color: var(--color-amber);
	}

	/* Editable fields borrow the number box's warm-black body and outline that
	   answers the pointer, kept simpler than the full punk-frame for a dense tree. */
	.raw-field {
		font-family: var(--font-ui);
		font-size: var(--text-ui-xs);
		line-height: var(--text-ui-xs--line-height);
		letter-spacing: -0.0425em;
		color: var(--color-ink);
		background-color: var(--color-void);
		border: 2px solid var(--color-edge-dim);
		padding: 0.125rem 0.5rem;
	}
	.raw-field:hover {
		border-color: var(--color-accent);
	}
	.raw-field:focus {
		border-color: var(--color-ink);
		outline: none;
	}
	.raw-check {
		width: 1rem;
		height: 1rem;
		accent-color: var(--color-accent);
	}

	.raw-more {
		margin-block: 0.25rem;
		font-family: var(--font-ui);
		font-size: var(--text-ui-xs);
		line-height: var(--text-ui-xs--line-height);
		color: var(--color-muted);
		background-color: transparent;
		border: 2px solid var(--color-edge);
		padding: 0.125rem 0.5rem;
		cursor: pointer;
	}
	.raw-more:hover {
		border-color: var(--color-accent);
		color: var(--color-accent);
	}
</style>
