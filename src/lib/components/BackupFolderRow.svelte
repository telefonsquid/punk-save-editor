<script lang="ts">
	// Where backups go, named and changeable. Options and the restore browser both
	// show this, and they must agree: the folder is one setting, so the line that
	// reports it and the button that repoints it are one component rather than two
	// copies drifting apart in wording and in what "no folder yet" looks like.
	//
	// A browser that cannot manage a folder has nothing to name and nothing to
	// change, so it gets the reason instead of an empty path and a dead button.
	//
	// Reading the remembered folder is the caller's job, not an `$effect` here:
	// it is IO that may open a picker, so it has to ride the click that opened
	// whatever is showing this.
	import Button from './Button.svelte';
	import DownloadOnlyNote from './DownloadOnlyNote.svelte';
	import { settings } from '$lib/editor/settings.svelte';

	let { label, onchange }: { label?: string; onchange: () => void } = $props();
</script>

{#if settings.folder && !settings.folder.restorable}
	<DownloadOnlyNote />
{:else}
	<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
		{#if label}
			<span class="text-muted text-ui-xs">{label}</span>
		{/if}
		<code class="grow text-stone text-ui-xs">{settings.folder?.label ?? 'no folder yet'}</code>
		<Button variant="outline" size="xs" onclick={onchange}>
			{settings.folder ? 'Change' : 'Choose'}
		</Button>
	</div>
{/if}
