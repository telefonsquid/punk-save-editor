<script lang="ts">
	import Button from './Button.svelte';
	import InfoPop from './InfoPop.svelte';
	import type { EditorState } from '$lib/editor/state.svelte';

	// The four controls that act on the open save. They live on the page's own
	// strip (SaveBar) and again in the grid editor's band, which covers the whole
	// screen and would otherwise strand somebody mid-edit with no way to save.
	// One component, so the two rows can never drift apart.
	let { editor, size = 'sm' }: { editor: EditorState; size?: 'sm' | 'xs' } = $props();
</script>

<!-- The "how downloading works" note folds behind the Download changes button,
     only in the download-only browsers that need it. -->
{#snippet downloadNote()}
	This browser can't modify the savefiles directly. <strong class="text-amber"
		>Download changes</strong
	> gives you a zip of the files you edited — extract it into your save folder to apply it. Backup hands
	you the whole folder the same way; putting one back has to be done by hand here. Don't modify the save
	while it's open in the game.
{/snippet}

<InfoPop note={editor.downloadMode ? downloadNote : undefined}>
	<Button variant="primary" {size} onclick={editor.save} disabled={!editor.dirty || editor.busy}>
		{editor.downloadMode ? 'Download changes' : 'Save changes'}
	</Button>
</InfoPop>
<!-- Backup and Restore are the pair the save folder itself is edited with, so
     they sit beside Save rather than behind a menu. Restore is hidden where it
     cannot work: a browser that can't write the folder can only hand the archive
     back as a download. -->
<Button variant="outline" {size} onclick={editor.backups.take} disabled={editor.busy}>Backup</Button>
{#if editor.backups.canRestore}
	<Button variant="outline" {size} onclick={editor.backups.browse} disabled={editor.busy}>
		Restore
	</Button>
{/if}
<Button variant="primary" {size} onclick={editor.open} disabled={editor.busy}>Load new save</Button>
