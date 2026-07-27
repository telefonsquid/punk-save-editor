<script lang="ts">
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import ReleaseNotes from './ReleaseNotes.svelte';
	import { releases } from '$lib/changelog';

	// Every release, over the page rather than instead of it. Reading the notes
	// used to mean navigating to /changelog, and the open save lives in memory —
	// leaving the editor threw it away and coming back meant picking the folder
	// again. A modal costs nothing to close.
	//
	// The page still exists, because a link to the notes has to lead somewhere;
	// it wraps the same ReleaseNotes in Section cards. Here they run flat: the
	// dialog is already a card, and a stack of slabs inside one reads as a list
	// of panels rather than a list of versions.
	let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<Dialog bind:open title="Changelog" width="44rem">
	{#snippet header()}
		<div class="ml-auto">
			<Button variant="ghost" size="sm" onclick={() => (open = false)}>Close</Button>
		</div>
	{/snippet}

	<div class="flex flex-col gap-9">
		{#each releases as release (release.version)}
			<article>
				<!-- The same heading block a Section draws, since a release is the same
				     shape of thing here as it is on the page. -->
				<div class="mb-4">
					<h2 class="punk-panel-title punk-title-shadow text-accent">{release.version}</h2>
					{#if release.date}
						<p class="mt-1 text-muted text-ui-xs">{release.date}</p>
					{/if}
				</div>
				<ReleaseNotes {release} />
			</article>
		{/each}
	</div>
</Dialog>
