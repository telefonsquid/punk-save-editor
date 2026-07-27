<script lang="ts">
	import NumberInput from '../NumberInput.svelte';
	import Section from '../Section.svelte';
	import { numInput, type NumInputOpts } from '$lib/editor/inputs';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { fmt1, formatDuration } from '$lib/format';
	import { runStats, type RunStats } from '$lib/save/rundata';

	let { editor }: { editor: EditorState } = $props();

	/** One editable run stat. `hint` prints the raw number in human terms. */
	interface Field {
		label: string;
		prop: keyof RunStats;
		/** Whole numbers unless the stat is a real quantity, like elapsed seconds. */
		float?: boolean;
		hint?: (v: number) => string;
	}

	const FIELDS: Field[] = [
		{ label: 'Enemies killed', prop: 'killedEnemyCount' },
		{ label: 'Bosses killed', prop: 'killedBossCount' },
		{ label: 'Run time', prop: 'totalRunTime', float: true, hint: formatDuration }
	];

	// Copy the scalars into a fresh object per recompute: the raw stats node
	// keeps its identity across edits, so returning it directly would never
	// repaint (see the snapshot rule in docs/editor-internals.md). `node` is
	// what the inputs write through to.
	const stats = $derived.by(() => {
		if (editor.version < 0 || !editor.slot) return null;
		const node = runStats(editor.slot.rundata);
		return {
			node,
			values: Object.fromEntries(FIELDS.map((f) => [f.prop, node[f.prop]])) as Record<
				keyof RunStats,
				number
			>
		};
	});

	const opts = (field: Field): NumInputOpts => ({
		min: 0,
		round: !field.float,
		file: 'rundata'
	});
</script>

<Section title="Run stats">
	{#if stats}
		{#each FIELDS as field (field.prop)}
			{@const value = stats.values[field.prop]}
			<label class="mb-2 flex items-center justify-between gap-4">
				<span>
					{field.label}
					{#if field.hint}<span class="text-muted">({field.hint(value)})</span>{/if}
				</span>
				<NumberInput
					class="w-36"
					min="0"
					step={field.float ? 'any' : undefined}
					value={field.float ? fmt1(value) : value}
					oninput={numInput(editor, stats.node, field.prop, opts(field))}
				/>
			</label>
		{/each}
	{/if}
</Section>
