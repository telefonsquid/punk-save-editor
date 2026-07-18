<script lang="ts">
	import { parseRichText } from '$lib/save/rich-text';

	let { text }: { text: string | null | undefined } = $props();

	const runs = $derived(parseRichText(text));
</script>

{#each runs as run, i (i)}
	{#if run.newline}
		<br />
	{:else if run.space !== undefined}
		<span style="display: inline-block; width: {run.space}em"></span>
	{:else}
		<span
			style:color={run.color}
			style:font-weight={run.bold ? 'bold' : undefined}
			style:font-style={run.italic ? 'italic' : undefined}
			style:text-decoration={run.underline ? 'underline' : run.strike ? 'line-through' : undefined}
		>{run.text}</span>
	{/if}
{/each}
