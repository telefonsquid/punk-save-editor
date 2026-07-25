<script lang="ts">
	import NumberInput from '../NumberInput.svelte';
	import Section from '../Section.svelte';
	import { numInput } from '$lib/editor/inputs';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { fmt1, formatDuration } from '$lib/format';
	import { runStats } from '$lib/save/rundata';

	let { editor }: { editor: EditorState } = $props();

	const stats = $derived.by(() => {
		if (editor.version < 0 || !editor.slot) return null;
		return runStats(editor.slot.rundata);
	});
</script>

<Section title="Run stats">
	{#if stats}
		<label class="mb-2 flex items-center justify-between gap-4">
			<span>Enemies killed</span>
			<NumberInput
				class="w-36"
				value={stats.killedEnemyCount}
				oninput={numInput(stats, 'killedEnemyCount')}
			/>
		</label>
		<label class="mb-2 flex items-center justify-between gap-4">
			<span>Bosses killed</span>
			<NumberInput
				class="w-36"
				value={stats.killedBossCount}
				oninput={numInput(stats, 'killedBossCount')}
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
				value={fmt1(stats.totalRunTime)}
				oninput={numInput(stats, 'totalRunTime')}
			/>
		</label>
	{/if}
</Section>
