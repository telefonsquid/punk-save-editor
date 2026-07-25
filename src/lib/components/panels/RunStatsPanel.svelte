<script lang="ts">
	import NumberInput from '../NumberInput.svelte';
	import Section from '../Section.svelte';
	import { numInput } from '$lib/editor/inputs';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { fmt1, formatDuration } from '$lib/format';
	import { runStats } from '$lib/save/rundata';

	let { editor }: { editor: EditorState } = $props();

	// Copy the scalars into a fresh object per recompute: the raw stats node
	// keeps its identity across edits, so returning it directly would never
	// repaint (see the snapshot rule in docs/editor-internals.md). `node` is
	// what the inputs write through to.
	const stats = $derived.by(() => {
		if (editor.version < 0 || !editor.slot) return null;
		const node = runStats(editor.slot.rundata);
		return {
			node,
			totalRunTime: node.totalRunTime,
			killedBossCount: node.killedBossCount,
			killedEnemyCount: node.killedEnemyCount
		};
	});
</script>

<Section title="Run stats">
	{#if stats}
		<label class="mb-2 flex items-center justify-between gap-4">
			<span>Enemies killed</span>
			<NumberInput
				class="w-36"
				min="0"
				value={stats.killedEnemyCount}
				oninput={numInput(editor, stats.node, 'killedEnemyCount', {
					min: 0,
					round: true,
					file: 'rundata'
				})}
			/>
		</label>
		<label class="mb-2 flex items-center justify-between gap-4">
			<span>Bosses killed</span>
			<NumberInput
				class="w-36"
				min="0"
				value={stats.killedBossCount}
				oninput={numInput(editor, stats.node, 'killedBossCount', {
					min: 0,
					round: true,
					file: 'rundata'
				})}
			/>
		</label>
		<label class="mb-2 flex items-center justify-between gap-4">
			<span>
				Run time
				<span class="text-muted">({formatDuration(stats.totalRunTime)})</span>
			</span>
			<NumberInput
				class="w-36"
				step="any"
				min="0"
				value={fmt1(stats.totalRunTime)}
				oninput={numInput(editor, stats.node, 'totalRunTime', { min: 0, file: 'rundata' })}
			/>
		</label>
	{/if}
</Section>
