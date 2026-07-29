<script lang="ts">
	import { onMount } from 'svelte';
	import Button from './Button.svelte';
	import InfoPop from './InfoPop.svelte';
	import PunkLogo from './PunkLogo.svelte';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { reveal } from '$lib/actions/reveal';
	import { supportsInPlaceSave } from '$lib/save/platform';

	let { editor }: { editor: EditorState } = $props();

	// Two questions about the disk, both asked once on the way in rather than
	// derived, and neither awaited into the markup: the screen draws straight away
	// and the second button appears a beat later if the backup folder has anything
	// in it. The other question — which save folder a restore would land in — has
	// no button of its own, and is asked here only so that the answer is in hand
	// by the time an archive is picked, rather than being read off the disk while
	// a click waits. Every failure either can meet is silent (see
	// `lookForArchives` and `rememberedSaveDir`), so nothing here can put an error
	// under the mark.
	onMount(() => {
		void editor.recallLastSave();
		void editor.backups.lookForArchives();
	});
</script>

<!-- The title screen is the whole page: the mark, one line naming what this
     is, and the single thing you can do. Everything else the old landing page
     said is either untrue yet or better said once a save is open. -->
<main class="flex-1 place-items-center grid px-6">
	<!-- w-full all the way down: the echoes fly out well past the wordmark,
	     and in a shrink-to-fit column the band would clip them at its own
	     width and the wings would simply not be there. -->
	<div class="flex flex-col items-center gap-10 w-full">
		<!-- The screen arrives the way every section of the editor does: the shared
		     rise-and-fade, staggered top to bottom so the mark lands first and the
		     reference table last. The wrappers exist because `use:reveal` needs an
		     element and both of these are components — the logo's carries the
		     centring its own `w-full` box relies on. -->
		<div class="flex justify-center w-full" use:reveal>
			<PunkLogo scale={4}>
				{#snippet subtitle()}
					<!-- Outlined because it sits on top of the echo tunnel, which is
					     bright and moving directly behind these letters. -->
					<p class="text-ink text-ui-sm uppercase punk-outlined punk-cap">Save Editor</p>
				{/snippet}
			</PunkLogo>
		</div>

		<!-- The saving note folds behind the open button itself. Feature detection
		     rather than sniffing for Firefox: what decides this is whether the File
		     System Access API is present, which is also false in Safari and
		     wherever it is turned off. -->
		{#snippet zipNote()}
			This browser can't write files directly — you'll get a zip to extract into your save
			folder. Chrome, Edge and the desktop app can modify savegames directly.
		{/snippet}
		<!-- The second way in, under the first and a size down from it, the way the
		     save strip sets Backup and Restore under Save: opening a folder is what
		     this screen is for and putting an archive back is the exception to it.
		     Shown only when there is something behind it — a backup folder
		     remembered from an earlier session with an archive in it. It opens the
		     list of archives right here and loads nothing: which save folder one
		     would go back into is settled once one is picked, and is a folder this
		     machine already knows unless it has never opened a save. -->
		<div class="flex flex-col items-center gap-4" use:reveal={{ delay: 120 }}>
			<InfoPop note={supportsInPlaceSave() ? undefined : zipNote}>
				<Button variant="primary" onclick={editor.open} disabled={editor.busy}>
					Open save folder
				</Button>
			</InfoPop>
			{#if editor.backups.offerRestore}
				<Button size="sm" onclick={editor.backups.browse} disabled={editor.busy}>
					Restore backup
				</Button>
			{/if}
		</div>

		{#if editor.error}
			<p class="text-danger text-ui-xs">{editor.error}</p>
		{/if}

		<!-- Where the game keeps its saves on each OS, so the folder picker above
		     has somewhere to point. The company/product folder is the same
		     everywhere; only the Unity data root per platform differs. -->
		<dl class="text-muted text-ui-xs punk-paths" use:reveal={{ delay: 240 }}>
			<div>
				<dt>Windows</dt>
				<dd><code>%USERPROFILE%\AppData\LocalLow\DefaultCompany\Punk\saves</code></dd>
			</div>
			<div>
				<dt>macOS</dt>
				<dd><code>~/Library/Application Support/DefaultCompany/Punk/saves</code></dd>
			</div>
			<div>
				<dt>Linux</dt>
				<dd><code>~/.config/unity3d/DefaultCompany/Punk/saves</code></dd>
			</div>
		</dl>
	</div>
</main>

<style>
	/* The three save paths: label left, path right, so they line up as a small
	   reference table rather than a paragraph. It hugs its content and centres, so
	   the widest path sets the width and every path stays on one line. */
	.punk-paths {
		display: grid;
		grid-template-columns: auto auto;
		gap: 0.25rem 1rem;
		width: max-content;
		max-width: 100%;
		text-align: left;
	}

	.punk-paths > div {
		display: contents;
	}

	.punk-paths dt {
		color: var(--color-ink);
	}

	/* One line each. On a screen too narrow to fit the longest path the row
	   scrolls sideways rather than wrapping mid-path. */
	.punk-paths code {
		white-space: nowrap;
	}
</style>
