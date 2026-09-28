<script lang="ts">
	import BackupPrompt from '$lib/components/BackupPrompt.svelte';
	import EditorHeader from '$lib/components/EditorHeader.svelte';
	import LoadOverlay from '$lib/components/LoadOverlay.svelte';
	import RestoreDialog from '$lib/components/RestoreDialog.svelte';
	import Tabs, { type Tab } from '$lib/components/Tabs.svelte';
	import TitleScreen from '$lib/components/TitleScreen.svelte';
	import ConsumablesPanel from '$lib/components/panels/ConsumablesPanel.svelte';
	import GridEditor from '$lib/components/grid/GridEditor.svelte';
	import RawFilesPanel from '$lib/components/panels/RawFilesPanel.svelte';
	import ResourcesPanel from '$lib/components/panels/ResourcesPanel.svelte';
	import RunStatsPanel from '$lib/components/panels/RunStatsPanel.svelte';
	import SaveBar from '$lib/components/SaveBar.svelte';
	import ShipResourcesPanel from '$lib/components/panels/ShipResourcesPanel.svelte';
	import { EditorState } from '$lib/editor/state.svelte';
	import { appHistory, saveId } from '$lib/editor/history.svelte';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fade } from 'svelte/transition';

	const editor = new EditorState();

	const TABS: Tab[] = [
		{ id: 'resources', label: 'Resources' },
		{ id: 'modules', label: 'Modules' },
		{ id: 'data', label: 'Stats & Game Data' }
	];
	// Which screen is showing is read off the history entry, not held here, so
	// Back and Forward replay it (see $lib/editor/history.svelte.ts). The editor
	// shows only when the entry names the save that is actually open: stepping
	// back to the title screen leaves the save in memory, and the entry pointing
	// at it is how Forward finds it again.
	const live = $derived(!!editor.slot && page.state.save === saveId(editor.slot));
	const panelTab = $derived(live ? (page.state.tab ?? 'resources') : 'resources');
	// The Modules tab is a door, not a page: selecting it opens the grid
	// editor's full-screen overlay over whatever panel was showing — an entry of
	// its own, so Back closes it — and closing the overlay hands the strip back
	// to that panel's tab.
	const gridOpen = $derived(live && !!page.state.grid);

	// A save that has just arrived — opened from the title screen, or restored
	// into — gets an entry of its own, on the Resources tab. Keyed on the slot
	// alone: stepping back to the title screen leaves the slot where it is and
	// must not push anything.
	$effect(() => {
		const slot = editor.slot;
		if (!slot) return;
		untrack(() => {
			const id = saveId(slot);
			if (page.state.save === id) return;
			// A restore over an open save keeps pointing at the title screen the
			// first one came from, which is where the mark goes back to.
			const from = page.state.save === undefined ? appHistory.index : page.state.from;
			appHistory.push({ save: id, from, tab: 'resources' });
		});
	});

	// An entry left behind by a save that is no longer open — closed from the
	// mark, or replaced by a restore — is stepped over.
	$effect(() => {
		appHistory.stale = (state) =>
			state.save !== undefined && (!editor.slot || state.save !== saveId(editor.slot));
		return () => (appHistory.stale = () => false);
	});

	function showTab(id: string) {
		if (id === 'modules') {
			if (!gridOpen) appHistory.push({ ...page.state, grid: true });
		} else if (id !== panelTab) {
			appHistory.push({ ...page.state, tab: id as 'resources' | 'data', grid: false });
		}
	}

	// The overlay closes itself on Esc and on its own Exit; either one is the
	// same as Back, and Back is what makes it so. A close that Back itself caused
	// finds the entry already moved on and does nothing.
	function setGridOpen(open: boolean) {
		if (open) showTab('modules');
		else if (page.state.grid) appHistory.back();
	}

	// One switch for every transition on the page. Someone who asked the OS to
	// reduce motion gets durations of zero, so the same code paints instantly for
	// them instead of sliding.
	const motion = $derived(prefersReducedMotion.current ? 0 : 1);
</script>

<svelte:head><title>PUNK Save Editor</title></svelte:head>

{#if editor.busy}
	<LoadOverlay label={editor.busyLabel} {motion} />
{/if}

<!-- Outside the branch below, unlike every other dialog: putting a backup back
     is the one thing here that does not need a save open, and the title screen
     is where somebody who just lost one starts. It opens over whichever of the
     two is showing. -->
<RestoreDialog {editor} />

{#if !live}
	<TitleScreen {editor} />
{:else}
	<div class="flex-1 px-6 py-8" in:fade={{ duration: 260 * motion }}>
		<EditorHeader {editor} />
		<!-- A child of this div rather than of the header: the save strip pins
		     itself to the top of the screen, and a sticky element can only travel
		     inside its own parent, so its parent has to be the page. -->
		<SaveBar {editor} />

		<!-- Asked once, just after the save above finished loading. -->
		<BackupPrompt {editor} />

		<div class="mx-auto max-w-6xl">
			<Tabs
				tabs={TABS}
				bind:current={() => (gridOpen ? 'modules' : panelTab), showTab}
				label="Editor sections"
			/>

			<div class="space-y-6 py-8">
				<!-- Failures only. Nothing announces a success — the screen already
				     shows it.

				     The backup line is here as well as inside the two dialogs, because
				     Backup is also a button on the strip above with no dialog behind
				     it. Each dialog drops the error as it closes, so this never shows
				     one the user has already read and dismissed. -->
				{#if editor.error}
					<p class="px-4 py-2 border-2 border-danger text-danger text-ui-xs">{editor.error}</p>
				{/if}
				{#if editor.backups.error}
					<p class="px-4 py-2 border-2 border-danger text-danger text-ui-xs">
						{editor.backups.error}
					</p>
				{/if}

				<!-- Each input handler marks its own file dirty; the version bump
				     happens here on change (blur), not on every keystroke, so
				     in-progress decimal typing isn't clobbered. -->
				<!-- Switching tabs remounts the panels below, so each section lifts itself
				     back into view on the way in (see the reveal action). No wrapper
				     transition here: one on top of the per-section lift would just stack
				     two moves on the same content. -->
				<div onchange={editor.refresh}>
					{#if panelTab === 'resources'}
						<!-- Ship tanks, then the inventory strip, then the consumable wheel —
						     stacked top to bottom to mirror the game's own resource screen.
						     Wide gaps so each category reads as its own block, not a list. -->
						<div class="space-y-40">
							<ShipResourcesPanel {editor} />
							<ResourcesPanel {editor} />
							<ConsumablesPanel {editor} />
						</div>
					{:else}
						<!-- Run stats are read-mostly trivia (kills, time, floor); they
						     share the tab with the raw file trees rather than taking a
						     slot next to the lists people actually came here to edit. -->
						<div class="space-y-6">
							<RunStatsPanel {editor} />
							<RawFilesPanel {editor} />
						</div>
					{/if}

					<!-- Inside the onchange delegate on purpose: the overlay's own
					     dialogs commit number edits through the same change events as
					     the panels. -->
					<GridEditor {editor} bind:open={() => gridOpen, setGridOpen} />
				</div>
			</div>
		</div>
	</div>
{/if}
