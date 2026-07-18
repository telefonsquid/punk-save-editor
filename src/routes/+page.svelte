<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import ConsumablesPanel from '$lib/components/panels/ConsumablesPanel.svelte';
	import ModulesPanel from '$lib/components/panels/ModulesPanel.svelte';
	import RawFilesPanel from '$lib/components/panels/RawFilesPanel.svelte';
	import RegenPanel from '$lib/components/panels/RegenPanel.svelte';
	import ResourcesPanel from '$lib/components/panels/ResourcesPanel.svelte';
	import RunStatsPanel from '$lib/components/panels/RunStatsPanel.svelte';
	import ShipResourcesPanel from '$lib/components/panels/ShipResourcesPanel.svelte';
	import { EditorState } from '$lib/editor/state.svelte';
	import { supportsInPlaceSave } from '$lib/save/io';

	const editor = new EditorState();
</script>

<svelte:head><title>PUNK Save Editor</title></svelte:head>

<div class="min-h-screen bg-zinc-950 text-zinc-100">
	<header
		class="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-zinc-800 bg-zinc-950/95 px-6 py-3"
	>
		<h1 class="text-lg font-bold tracking-widest text-lime-400 uppercase">Punk Save Editor</h1>
		<div class="flex-1"></div>
		{#if editor.slot}
			<span class="text-sm text-zinc-400">{editor.slot.dir.name}</span>
		{/if}
		<Button onclick={editor.open} disabled={editor.busy}>Open save folder</Button>
		<Button
			variant="primary"
			onclick={editor.save}
			disabled={!editor.slot || !editor.dirty || editor.busy}
		>
			{editor.downloadMode ? 'Download changes' : 'Save changes'}
		</Button>
	</header>

	<main class="mx-auto max-w-5xl space-y-6 px-6 py-6">
		{#if editor.error}
			<p class="rounded border border-red-700 bg-red-950 px-4 py-2 text-sm text-red-300">
				{editor.error}
			</p>
		{/if}
		{#if editor.statusMessage}
			<p class="rounded border border-lime-800 bg-lime-950 px-4 py-2 text-sm text-lime-300">
				{editor.statusMessage}
			</p>
		{/if}
		{#if editor.downloadMode}
			<p class="rounded border border-amber-800 bg-amber-950/50 px-4 py-2 text-xs text-amber-300">
				This browser edits in memory. <strong>Download changes</strong> gives you a zip — extract it
				into your save folder to apply it (it includes <code>.bak</code> backups). Close the game first.
			</p>
		{/if}

		{#if !editor.slot}
			<div class="rounded-lg border border-dashed border-zinc-700 p-12 text-center text-zinc-400">
				<p class="mb-2 text-lg">Open a PUNK save folder to start editing.</p>
				<p class="text-sm">
					Saves live in
					<code class="rounded bg-zinc-900 px-1.5 py-0.5 text-xs"
						>%USERPROFILE%\AppData\LocalLow\DefaultCompany\Punk\saves\save001</code
					>
				</p>
				{#if !supportsInPlaceSave()}
					<p class="mt-4 text-sm text-amber-400">
						This browser can't write files directly. You'll pick your save folder, edit, then
						download a zip of the changes to extract back into it. For in-place saving, use a
						Chromium browser (Chrome, Edge) or the desktop app.
					</p>
				{/if}
				<p class="mt-4 text-xs text-zinc-500">
					Close the game before editing — it keeps saves in memory while running.
				</p>
			</div>
		{:else}
			<ShipResourcesPanel {editor} />
			<RegenPanel {editor} />

			<!-- Curated vault/rundata sections: any input marks the files dirty,
			     and the version bump happens on change (blur), not on every
			     keystroke, so in-progress decimal typing isn't clobbered. -->
			<div class="grid gap-6 md:grid-cols-2" oninput={editor.markCurated} onchange={editor.refresh}>
				<ResourcesPanel {editor} />
				<RunStatsPanel {editor} />
				<ConsumablesPanel {editor} />
				<ModulesPanel {editor} />
			</div>

			<RawFilesPanel {editor} />
		{/if}
	</main>
</div>
