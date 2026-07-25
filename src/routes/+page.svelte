<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import PunkLogo from '$lib/components/PunkLogo.svelte';
	import Tabs, { type Tab } from '$lib/components/Tabs.svelte';
	import ConsumablesPanel from '$lib/components/panels/ConsumablesPanel.svelte';
	import ModulesPanel from '$lib/components/panels/ModulesPanel.svelte';
	import RawFilesPanel from '$lib/components/panels/RawFilesPanel.svelte';
	import ResourcesPanel from '$lib/components/panels/ResourcesPanel.svelte';
	import RunStatsPanel from '$lib/components/panels/RunStatsPanel.svelte';
	import ShipResourcesPanel from '$lib/components/panels/ShipResourcesPanel.svelte';
	import { EditorState } from '$lib/editor/state.svelte';
	import { supportsInPlaceSave } from '$lib/save/io';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fade } from 'svelte/transition';

	const editor = new EditorState();

	const TABS: Tab[] = [
		{ id: 'resources', label: 'Resources' },
		{ id: 'modules', label: 'Modules' },
		{ id: 'data', label: 'Stats & Game Data' }
	];
	let tab = $state('resources');

	// One switch for every transition on the page. Someone who asked the OS to
	// reduce motion gets durations of zero, so the same code paints instantly for
	// them instead of sliding.
	const motion = $derived(prefersReducedMotion.current ? 0 : 1);

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

<svelte:head><title>PUNK Save Editor</title></svelte:head>

{#if editor.busy}
	<!-- One steady wait over everything while a save decodes or writes. The editor
	     renders behind it, so lifting this reveals a page that is already painted
	     rather than one that pops in a panel at a time. Dissolving it out is the
	     load-finished reveal: the drawn editor fades up as the cover clears. -->
	<div class="load-overlay" transition:fade={{ duration: 220 * motion }}>
		<Loading label={editor.busyLabel} />
	</div>
{/if}

{#if !editor.slot}
	<!-- The title screen is the whole page: the mark, one line naming what this
	     is, and the single thing you can do. Everything else the old landing page
	     said is either untrue yet or better said once a save is open. -->
	<main class="flex-1 place-items-center grid px-6">
		<!-- w-full all the way down: the echoes fly out well past the wordmark,
		     and in a shrink-to-fit column the band would clip them at its own
		     width and the wings would simply not be there. -->
		<div class="flex flex-col items-center gap-10 w-full">
			<PunkLogo scale={4}>
				{#snippet subtitle()}
					<!-- Outlined because it sits on top of the echo tunnel, which is
					     bright and moving directly behind these letters. -->
					<p class="text-ink text-ui-sm uppercase punk-outlined punk-cap">Save Editor</p>
				{/snippet}
			</PunkLogo>

			<!-- The saving note folds behind the open button itself: hovering or
			     focusing it unfolds the explanation, so there is no separate key to
			     read. Feature detection rather than sniffing for Firefox: what decides
			     this is whether the File System Access API is present, which is also
			     false in Safari and wherever it is turned off. -->
			<span class="punk-info-wrap">
				<Button variant="primary" onclick={editor.open} disabled={editor.busy}>
					Open save folder
				</Button>

				{#if !supportsInPlaceSave()}
					<span class="text-muted text-ui-xs punk-info-pop">
						This browser can't write files directly — you'll get a zip to extract into your save
						folder. Chrome, Edge and the desktop app can modify savegames directly.
					</span>
				{/if}
			</span>

			{#if editor.error}
				<p class="text-danger text-ui-xs">{editor.error}</p>
			{/if}

			<!-- Where the game keeps its saves on each OS, so the folder picker above
			     has somewhere to point. The company/product folder is the same
			     everywhere; only the Unity data root per platform differs. -->
			<dl class="text-muted text-ui-xs punk-paths">
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
{:else}
	<div class="flex-1 px-6 py-8" in:fade={{ duration: 260 * motion }}>
		<!-- No top bar any more: the mark just sits centred above the tabs, smaller
		     than on the title screen, so the editor still reads as PUNK's without
		     spending a fixed strip of every screen on chrome. -->
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
					<p class="text-amber text-ui-xs">
						Unsaved changes. Click the mark again to discard them.
					</p>
					<Button variant="ghost" size="xs" onclick={() => (leaving = false)}>Cancel</Button>
				</div>
			{/if}
			<!-- The open save and its save button sit centred under the mark rather
			     than off in the tab row, so the strip below is left to the tabs
			     alone and the two most important controls are on the centre line. -->
			<div class="flex items-center gap-4">
				<span class="text-muted text-ui-xs">{editor.slot.dir.name}</span>
				<!-- The "how downloading works" note folds behind the Download changes
				     button: hovering or focusing it unfolds the explanation, only in the
				     download-only browsers that need it. -->
				<span class="punk-info-wrap">
					<Button
						variant="primary"
						size="sm"
						onclick={editor.save}
						disabled={!editor.dirty || editor.busy}
					>
						{editor.downloadMode ? 'Download changes' : 'Save changes'}
					</Button>
					{#if editor.downloadMode}
						<span class="text-muted text-ui-xs punk-info-pop">
							This browser can't modify the savefiles directly. <strong class="text-amber">Download changes</strong> gives
							you a zip — extract it into your save folder to apply it (it includes
							<code>.bak</code> backups). Don't modify while a savefile is open currently.
						</span>
					{/if}
				</span>
				<Button variant="primary" size="sm" onclick={editor.open} disabled={editor.busy}>
					Load new save
				</Button>
			</div>
		</header>

		<div class="mx-auto max-w-6xl">
			<Tabs tabs={TABS} bind:current={tab} label="Editor sections" />

			<div class="space-y-6 py-8">
				{#if editor.error}
					<p class="px-4 py-2 border-2 border-danger text-danger text-ui-xs">{editor.error}</p>
				{/if}
				{#if editor.statusMessage}
					<p class="px-4 py-2 border-2 border-edge text-muted text-ui-xs">{editor.statusMessage}</p>
				{/if}

				<!-- Any input marks the files dirty, and the version bump happens on
				     change (blur), not on every keystroke, so in-progress decimal
				     typing isn't clobbered. -->
				<!-- Switching tabs remounts the panels below, so each section lifts itself
				     back into view on the way in (see the reveal action). No wrapper
				     transition here: one on top of the per-section lift would just stack
				     two moves on the same content. -->
				<div oninput={editor.markCurated} onchange={editor.refresh}>
					{#if tab === 'resources'}
						<!-- Ship tanks, then the inventory strip, then the consumable wheel —
						     stacked top to bottom to mirror the game's own resource screen.
						     Wide gaps so each category reads as its own block, not a list. -->
						<div class="space-y-40">
							<ShipResourcesPanel {editor} />
							<ResourcesPanel {editor} />
							<ConsumablesPanel {editor} />
						</div>
					{:else if tab === 'modules'}
						<ModulesPanel {editor} />
					{:else}
						<!-- Run stats are read-mostly trivia (kills, time, floor); they
						     share the tab with the raw file trees rather than taking a
						     slot next to the lists people actually came here to edit. -->
						<div class="space-y-6">
							<RunStatsPanel {editor} />
							<RawFilesPanel {editor} />
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Covers the whole viewport while a save is decoding or writing. Solid over the
	   void so the editor painting itself behind this never shows through — it is
	   fully drawn by the time the overlay lifts, instead of popping in panel by
	   panel. */
	.load-overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		place-items: center;
		background-color: var(--color-void);
	}

	/* The button an info note belongs to sits inside this wrapper; hovering or
	   focusing anywhere in it unfolds the note below. The button keeps its own
	   click behaviour — the note is purely a hover reveal. */
	.punk-info-wrap {
		position: relative;
		display: inline-flex;
	}

	.punk-info-pop {
		position: absolute;
		top: calc(100% + 0.5rem);
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		/* Wider than the trigger so the note reads as a few short lines, not a
		   narrow column. */
		width: 32rem;
		max-width: 90vw;
		padding: 0.5rem 0.75rem;
		border: 2px solid var(--color-edge-dim);
		background-color: var(--color-surface);
		text-align: left;
		opacity: 0;
		pointer-events: none;
		visibility: hidden;
	}

	.punk-info-wrap:hover .punk-info-pop,
	.punk-info-wrap:focus-within .punk-info-pop {
		opacity: 1;
		visibility: visible;
	}

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
