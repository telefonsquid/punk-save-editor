<script lang="ts">
	import RawTree from '../RawTree.svelte';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { ODIN_FILES, OPAQUE_FILES } from '$lib/save/slot';

	let { editor }: { editor: EditorState } = $props();
</script>

{#if editor.slot}
	<details class="rounded-lg border border-amber-900/60 bg-zinc-900/50">
		<summary
			class="cursor-pointer px-5 py-4 text-sm font-bold tracking-widest text-amber-400 uppercase select-none"
		>
			Modify at your own risk
		</summary>
		<div class="space-y-3 px-5 pb-5">
			<p class="text-sm text-zinc-400">
				Every value the save files contain, unfiltered. The game does not validate any of this:
				nonsensical values can corrupt the run or make it fail to load (originals are backed up
				as <code class="text-xs">*.bak</code> on first save). Changes here are saved per file
				with the Save button above.
			</p>
			{#each ODIN_FILES as name (name)}
				<details
					class="rounded border border-zinc-800 bg-zinc-950/50 px-3 py-2"
					ontoggle={(e) => editor.openRawFile(name, e.currentTarget.open)}
				>
					<summary class="cursor-pointer text-sm font-semibold text-zinc-300 select-none">
						{name}
						{#if editor.dirtyFiles.has(name)}
							<span class="text-xs text-amber-400">· modified</span>
						{:else if !editor.loadedFiles.has(name)}
							<span class="text-xs text-zinc-600">· click to load</span>
						{/if}
					</summary>
					{#if editor.loadedFiles.has(name)}
						<div class="mt-2">
							<RawTree
								container={editor.slot.files}
								key={name}
								label="root"
								ondirty={() => {
									editor.dirtyFiles.add(name);
									editor.refresh();
								}}
							/>
						</div>
					{:else if editor.rawLoading === name}
						<p class="mt-2 text-sm text-zinc-500">Decoding…</p>
					{/if}
				</details>
			{/each}
			<p class="text-xs text-zinc-600">
				Not editable here: {OPAQUE_FILES.join(', ')} (raw terrain data and PNG images rather
				than serialized objects).
			</p>
		</div>
	</details>
{/if}
