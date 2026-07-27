<script lang="ts">
	import EditorHeader from '$lib/components/EditorHeader.svelte';
	import LoadOverlay from '$lib/components/LoadOverlay.svelte';
	import Tabs, { type Tab } from '$lib/components/Tabs.svelte';
	import TitleScreen from '$lib/components/TitleScreen.svelte';
	import ConsumablesPanel from '$lib/components/panels/ConsumablesPanel.svelte';
	import ModulesPanel from '$lib/components/panels/ModulesPanel.svelte';
	import RawFilesPanel from '$lib/components/panels/RawFilesPanel.svelte';
	import ResourcesPanel from '$lib/components/panels/ResourcesPanel.svelte';
	import RunStatsPanel from '$lib/components/panels/RunStatsPanel.svelte';
	import SaveBar from '$lib/components/SaveBar.svelte';
	import ShipResourcesPanel from '$lib/components/panels/ShipResourcesPanel.svelte';
	import { EditorState } from '$lib/editor/state.svelte';
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
</script>

<svelte:head><title>PUNK Save Editor</title></svelte:head>

{#if editor.busy}
	<LoadOverlay label={editor.busyLabel} {motion} />
{/if}

{#if !editor.slot}
	<TitleScreen {editor} />
{:else}
	<div class="flex-1 px-6 py-8" in:fade={{ duration: 260 * motion }}>
		<EditorHeader {editor} />
		<!-- A child of this div rather than of the header: the save strip pins
		     itself to the top of the screen, and a sticky element can only travel
		     inside its own parent, so its parent has to be the page. -->
		<SaveBar {editor} />

		<div class="mx-auto max-w-6xl">
			<Tabs tabs={TABS} bind:current={tab} label="Editor sections" />

			<div class="space-y-6 py-8">
				{#if editor.error}
					<p class="px-4 py-2 border-2 border-danger text-danger text-ui-xs">{editor.error}</p>
				{/if}
				{#if editor.statusMessage}
					<p class="px-4 py-2 border-2 border-edge text-muted text-ui-xs">{editor.statusMessage}</p>
				{/if}

				<!-- Each input handler marks its own file dirty; the version bump
				     happens here on change (blur), not on every keystroke, so
				     in-progress decimal typing isn't clobbered. -->
				<!-- Switching tabs remounts the panels below, so each section lifts itself
				     back into view on the way in (see the reveal action). No wrapper
				     transition here: one on top of the per-section lift would just stack
				     two moves on the same content. -->
				<div onchange={editor.refresh}>
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
