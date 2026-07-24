<script lang="ts">
	import Button from '$lib/components/Button.svelte';
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

	const editor = new EditorState();

	const TABS: Tab[] = [
		{ id: 'resources', label: 'Resources' },
		{ id: 'modules', label: 'Modules' },
		{ id: 'data', label: 'Stats & Game Data' }
	];
	let tab = $state('resources');
</script>

<svelte:head><title>PUNK Save Editor</title></svelte:head>

{#if !editor.slot}
	<!-- The title screen is the whole page: the mark, one line naming what this
	     is, and the single thing you can do. Everything else the old landing page
	     said is either untrue yet or better said once a save is open. -->
	<main class="grid min-h-screen place-items-center px-6">
		<!-- w-full all the way down: the echoes fly out well past the wordmark,
		     and in a shrink-to-fit column the band would clip them at its own
		     width and the wings would simply not be there. -->
		<div class="flex w-full flex-col items-center gap-10">
			<PunkLogo scale={4}>
				{#snippet subtitle()}
					<!-- Outlined because it sits on top of the echo tunnel, which is
					     bright and moving directly behind these letters. -->
					<p class="punk-outlined punk-cap text-ui-sm text-ink uppercase">Save Editor</p>
				{/snippet}
			</PunkLogo>

			<Button variant="primary" onclick={editor.open} disabled={editor.busy}>
				Open save folder
			</Button>

			{#if !supportsInPlaceSave()}
				<!-- Feature detection rather than sniffing for Firefox: what actually
				     decides this is whether the File System Access API is present,
				     which is also false in Safari and wherever it has been turned off. -->
				<p class="max-w-md text-center text-ui-xs text-muted">
					This browser can't write files directly — you'll get a zip to extract into your save
					folder. Chrome, Edge and the desktop app save in place.
				</p>
			{/if}

			{#if editor.error}
				<p class="text-ui-xs text-danger">{editor.error}</p>
			{/if}
		</div>
	</main>
{:else}
	<div class="min-h-screen px-6 py-8">
		<!-- No top bar any more: the mark just sits centred above the tabs, smaller
		     than on the title screen, so the editor still reads as PUNK's without
		     spending a fixed strip of every screen on chrome. -->
		<header class="mb-10 flex w-full flex-col items-center gap-5">
			<PunkLogo scale={2} echoes={10}>
				{#snippet subtitle()}
					<p class="punk-outlined punk-cap text-ui-xs text-muted uppercase">Save Editor</p>
				{/snippet}
			</PunkLogo>
			<!-- The open save and its save button sit centred under the mark rather
			     than off in the tab row, so the strip below is left to the tabs
			     alone and the two most important controls are on the centre line. -->
			<div class="flex items-center gap-4">
				<span class="text-ui-xs text-muted">{editor.slot.dir.name}</span>
				<Button
					variant="primary"
					size="sm"
					onclick={editor.save}
					disabled={!editor.dirty || editor.busy}
				>
					{editor.downloadMode ? 'Download changes' : 'Save changes'}
				</Button>
			</div>
		</header>

		<div class="mx-auto max-w-6xl">
			<Tabs tabs={TABS} bind:current={tab} label="Editor sections" />

			<div class="space-y-6 py-8">
				{#if editor.error}
					<p class="border-2 border-danger px-4 py-2 text-ui-xs text-danger">{editor.error}</p>
				{/if}
				{#if editor.statusMessage}
					<p class="border-2 border-edge px-4 py-2 text-ui-xs text-muted">{editor.statusMessage}</p>
				{/if}
				{#if editor.downloadMode}
					<p class="border-2 border-edge-dim px-4 py-2 text-ui-xs text-muted">
						This browser edits in memory. <strong class="text-amber">Download changes</strong> gives
						you a zip — extract it into your save folder to apply it (it includes
						<code>.bak</code> backups). Close the game first.
					</p>
				{/if}

				<!-- Any input marks the files dirty, and the version bump happens on
				     change (blur), not on every keystroke, so in-progress decimal
				     typing isn't clobbered. -->
				<div oninput={editor.markCurated} onchange={editor.refresh}>
					{#if tab === 'resources'}
						<div class="space-y-6">
							<ShipResourcesPanel {editor} />
							<div class="grid gap-6 md:grid-cols-2">
								<ResourcesPanel {editor} />
								<ConsumablesPanel {editor} />
							</div>
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
