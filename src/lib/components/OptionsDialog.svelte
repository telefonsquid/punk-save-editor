<script lang="ts">
	import BackupFolderRow from './BackupFolderRow.svelte';
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import { settings } from '$lib/editor/settings.svelte';
	import { sound } from '$lib/sound.svelte';

	// The app's settings, off the footer — the one place reachable with no save
	// open. That is the whole reason they are not on the save bar beside the
	// buttons that use them: all of these outlive the session they were set in,
	// and switching the load-time question back on should not mean loading a save
	// first to find the switch.
	//
	// The two backup settings live in `editor/settings.svelte.ts` and the sound
	// switch in `lib/sound.svelte.ts`, with the audio it governs. A dialog is a
	// place settings are *shown*, not a reason to keep them in one box.
	//
	// The remembered folder is read by whoever opens this (AppFooter), not by an
	// effect in here, so choosing a new one still rides the click that asked for
	// it — a directory picker is only allowed while a user gesture is live.
	//
	// `onchoose` comes from outside rather than calling `settings.repick()` here,
	// so the picker's failures land in the same place every other backup failure
	// does instead of in a third error line this dialog keeps to itself.
	let {
		open = $bindable(false),
		onchoose,
		error = null
	}: { open?: boolean; onchoose: () => void; error?: string | null } = $props();
</script>

<Dialog bind:open title="Options" width="34rem">
	<section>
		<h3 class="punk-group-title">Backup folder</h3>
		<p class="mt-2 text-muted text-ui-xs">
			Where <strong class="text-ink">Backup</strong> writes and <strong class="text-ink">Restore</strong>
			reads. Keep it outside the save folder, so a wipe can't take the backups with it.
		</p>
		<div class="mt-3">
			<BackupFolderRow onchange={onchoose} />
		</div>
		{#if error}
			<p class="mt-3 text-danger text-ui-xs">{error}</p>
		{/if}
	</section>

	<section class="mt-8">
		<h3 class="punk-group-title">Opening a save</h3>
		<label class="mt-3 flex items-center gap-2 text-muted text-ui-xs">
			<input
				type="checkbox"
				class="punk-check"
				checked={settings.askOnLoad}
				onchange={(e) => settings.setAskOnLoad(e.currentTarget.checked)}
			/>
			Offer to back the save up first
		</label>
	</section>

	<section class="mt-8">
		<h3 class="punk-group-title">Sound</h3>
		<label class="mt-3 flex items-center gap-2 text-muted text-ui-xs">
			<input
				type="checkbox"
				class="punk-check"
				checked={sound.enabled}
				onchange={(e) => {
					sound.setEnabled(e.currentTarget.checked);
					// Switching them on answers in the thing being switched on, which
					// is the only proof the setting can offer that it took.
					sound.play('click');
				}}
			/>
			Play the game's interface sounds
		</label>
	</section>

	{#snippet footer()}
		<div class="ml-auto">
			<Button variant="ghost" size="sm" onclick={() => (open = false)}>Close</Button>
		</div>
	{/snippet}
</Dialog>
