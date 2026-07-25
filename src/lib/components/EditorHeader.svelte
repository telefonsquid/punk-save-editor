<script lang="ts">
	import Button from './Button.svelte';
	import InfoPop from './InfoPop.svelte';
	import PunkLogo from './PunkLogo.svelte';
	import type { EditorState } from '$lib/editor/state.svelte';

	let { editor }: { editor: EditorState } = $props();

	// Going back to the title screen drops everything that was never written, so
	// a dirty save asks once rather than disappearing under the pointer. A native
	// confirm() is not dependable across the three webviews this runs in, so the
	// question is a second click on the same mark.
	let leaving = $state(false);

	function backToStart() {
		if (editor.dirty && !leaving) {
			leaving = true;
			return;
		}
		leaving = false;
		editor.close();
	}
</script>

<!-- No top bar: the mark just sits centred above the tabs, smaller than on the
     title screen, so the editor still reads as PUNK's without spending a fixed
     strip of every screen on chrome. -->
<header class="flex flex-col items-center gap-5 mb-10 w-full">
	<!-- The mark doubles as the way out: clicking it drops the open save and
	     goes back to the title screen. -->
	<PunkLogo scale={2} echoes={10} onclick={backToStart} label="Back to the save selection">
		{#snippet subtitle()}
			<p class="text-muted text-ui-xs uppercase punk-outlined punk-cap">Save Editor</p>
		{/snippet}
	</PunkLogo>

	{#if leaving}
		<div class="flex items-center gap-3">
			<p class="text-amber text-ui-xs">Unsaved changes. Click the mark again to discard them.</p>
			<Button variant="ghost" size="xs" onclick={() => (leaving = false)}>Cancel</Button>
		</div>
	{/if}
	<!-- The open save and its save button sit centred under the mark rather
	     than off in the tab row, so the strip below is left to the tabs
	     alone and the two most important controls are on the centre line. -->
	<div class="flex items-center gap-4">
		<span class="text-muted text-ui-xs">{editor.slot?.dir.name}</span>
		<!-- The "how downloading works" note folds behind the Download changes
		     button, only in the download-only browsers that need it. -->
		{#snippet downloadNote()}
			This browser can't modify the savefiles directly. <strong class="text-amber"
				>Download changes</strong
			> gives you a zip — extract it into your save folder to apply it (it includes a
			<code>.bak</code> of every file). Don't modify while a savefile is open currently.
		{/snippet}
		<InfoPop note={editor.downloadMode ? downloadNote : undefined}>
			<Button
				variant="primary"
				size="sm"
				onclick={editor.save}
				disabled={!editor.dirty || editor.busy}
			>
				{editor.downloadMode ? 'Download changes' : 'Save changes'}
			</Button>
		</InfoPop>
		<Button variant="primary" size="sm" onclick={editor.open} disabled={editor.busy}>
			Load new save
		</Button>
	</div>
</header>
