<script lang="ts">
	import BackupFolderRow from './BackupFolderRow.svelte';
	import Button from './Button.svelte';
	import CloseBadge from './CloseBadge.svelte';
	import Dialog from './Dialog.svelte';
	import { formatBytes } from '$lib/format';
	import type { EditorState } from '$lib/editor/state.svelte';

	// The backup folder, as a list you can put back. Every `.zip` in it is
	// offered, not only the ones this editor wrote — a backup made by hand with
	// the file manager is the same thing, and refusing to read it would mean the
	// editor only trusts its own copies of a format it does not own.
	//
	// Picking one does not restore it. It is read and checked first, and the
	// question that follows names what the archive actually holds, because a file
	// name is the one part of an archive that nothing verifies. Throwing one away
	// asks too, for the plainer reason that nothing gets it back.
	//
	// Both questions take over the whole dialog rather than opening a second one
	// on top or answering inside the row: a confirm nested in a modal is two Esc
	// keys with different meanings, and the list a question was asked from is
	// exactly what it is safe to hide while it is up.
	//
	// The list is read by whatever opens the dialog (`backups.browse`), not by an
	// effect in here: reading a folder is IO, and it has to ride the click that
	// asked for it — choosing the folder for the first time opens a picker, which
	// browsers only allow while a user gesture is live.
	//
	// This dialog is also the one thing here that opens with no save loaded, from
	// the title screen, so nothing in it may assume `editor.slot`. Where a restore
	// lands is settled by `backups.prepare` before the question is asked, and the
	// question reads that rather than the open save.
	let { editor }: { editor: EditorState } = $props();

	const backups = $derived(editor.backups);
	const pending = $derived(backups.pending);
	const doomed = $derived(backups.doomed);
	/** The folder a restore would be written into: always known once one is pending. */
	const into = $derived(pending?.dir.name ?? '');
	/** The open save, if there is one — what a delete promises not to touch. */
	const openName = $derived(editor.slot?.dir.name ?? '');

	// Three screens, one dialog: the list, and a question in front of it.
	const title = $derived.by(() => {
		if (pending) return 'Restore this backup?';
		if (doomed) return 'Delete this backup?';
		return 'Restore a backup';
	});

	function when(ms: number | null): string {
		if (ms === null) return 'date unknown';
		return new Date(ms).toLocaleString(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
	}
</script>

<Dialog
	bind:open={backups.browsing}
	{title}
	width="40rem"
	tone={pending || doomed ? 'warn' : 'default'}
	onclose={backups.closeBrowser}
>
	{#if pending}
		<!-- The confirm reads out of the archive rather than off its file name:
		     the count is what was found inside it, and the folder line is how you
		     catch yourself about to write save002 over save001. -->
		<p class="text-ui-xs text-ink">
			<code>{pending.file.name}</code>
		</p>
		<p class="mt-3 text-muted text-ui-xs">
			{pending.files.length} files
			{#if pending.folder}from <code class="text-stone">{pending.folder}</code>{/if}
			will be written over <strong class="text-ink">{into}</strong>.
		</p>
		{#if pending.folder && pending.folder !== into}
			<p class="mt-3 text-amber text-ui-xs">
				This archive was taken from <strong>{pending.folder}</strong>, not from
				<strong>{into}</strong>. Restoring it makes <strong>{into}</strong> a copy of
				<strong>{pending.folder}</strong>.
			</p>
		{/if}
		<p class="mt-3 text-danger text-ui-xs">
			The save folder as it stands now is not kept.{editor.dirty
				? ' Your unsaved changes go with it.'
				: ''}
		</p>
	{:else if doomed}
		<!-- The same two lines the row showed, so the archive being named is
		     visibly the one that was clicked. -->
		<p class="text-ui-xs text-ink">
			<code>{doomed.name}</code>
		</p>
		<p class="mt-3 text-muted text-ui-xs">
			{when(doomed.modified)} · {formatBytes(doomed.size)}
		</p>
		<p class="mt-3 text-danger text-ui-xs">
			The archive is deleted off the disk, not moved to the recycle bin.{#if openName}
				Nothing in <strong class="text-ink">{openName}</strong> is touched.{/if}
		</p>
	{:else}
		<BackupFolderRow label="Backups in" onchange={backups.chooseFolder} />

		{#if backups.error}
			<p class="mt-4 text-danger text-ui-xs">{backups.error}</p>
		{/if}

		{#if backups.archives.length === 0}
			<!-- Two ways to end up here with nothing listed: the folder was always
			     empty, or the last archive in it was just deleted from this list —
			     which can happen with no save open, where there is no bar to point at. -->
			<p class="mt-4 text-muted text-ui-xs">
				No archives here yet.
				{#if editor.slot}
					<strong class="text-ink">Backup</strong> on the bar above writes one.
				{:else}
					Open a save folder and <strong class="text-ink">Backup</strong> writes one.
				{/if}
			</p>
		{:else}
			<ul class="mt-4 flex flex-col gap-2">
				{#each backups.archives as archive (archive.name)}
					<li class="punk-row archive-row">
						<div class="min-w-0">
							<p class="truncate text-ink text-ui-xs">{archive.name}</p>
							<p class="text-muted text-ui-xs">
								{when(archive.modified)} · {formatBytes(archive.size)}
							</p>
						</div>
						<div class="flex shrink-0 items-center gap-3">
							<Button
								variant="outline"
								size="xs"
								disabled={editor.busy}
								onclick={() => backups.prepare(archive)}
							>
								Restore
							</Button>
							<!-- A modal sits in the top layer, above the wait overlay, so
							     every control in here has to answer `busy` itself. -->
							<CloseBadge
								label="Delete {archive.name}"
								disabled={editor.busy}
								onclick={() => backups.askDelete(archive)}
							/>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	{#snippet footer()}
		{#if pending}
			<div class="ml-auto flex items-center gap-2">
				<Button variant="ghost" size="sm" onclick={backups.cancel}>Cancel</Button>
				<Button variant="danger" size="sm" onclick={backups.confirm}>
					Overwrite {into}
				</Button>
			</div>
		{:else if doomed}
			<div class="ml-auto flex items-center gap-2">
				<Button variant="ghost" size="sm" onclick={backups.cancelDelete}>Cancel</Button>
				<Button variant="danger" size="sm" onclick={backups.discard}>Delete</Button>
			</div>
		{:else}
			<!-- Only Close. The load-time question is a setting rather than part of
			     putting a backup back, and it is switched in Options, off the
			     footer. -->
			<div class="ml-auto">
				<Button variant="ghost" size="sm" onclick={backups.closeBrowser}>Close</Button>
			</div>
		{/if}
	{/snippet}
</Dialog>

<style>
	/* `punk-row` is the box; this is only how the row lays out inside it —
	   name and date on the left, the two actions on the right. */
	.archive-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
</style>
