<script lang="ts">
	import RawTree from '../RawTree.svelte';
	import Section from '../Section.svelte';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { ODIN_FILES, OPAQUE_FILES } from '$lib/save/slot';

	let { editor }: { editor: EditorState } = $props();
</script>

{#if editor.slot}
	<!-- The same card every other section wears — the "at your own risk" warning
	     lives in the title, so the frame need not shout. It lifts in behind the run
	     stats above it rather than alongside them. -->
	<Section title="Raw Game Data - modify at your own risk" revealDelay={120}>
		<div class="raw-panel-body">
			<p class="raw-panel-note">
				Every value the save files contain, unfiltered. The game does not validate any of this:
				nonsensical values can corrupt the run or make it fail to load (the first save backs the
				whole folder up as <code>*.bak</code>). Changes here are saved per file with the Save button
				above.
			</p>
			{#each ODIN_FILES as name (name)}
				<details
					class="raw-panel-file"
					ontoggle={(e) => editor.openRawFile(name, e.currentTarget.open)}
				>
					<summary class="raw-panel-file-title">
						{name}
						<!-- Plain hyphens: the DOS face has no middle dot at that code
						     point and draws a pilcrow in its place. -->
						{#if editor.dirtyFiles.has(name)}
							<span class="raw-panel-mod">- modified</span>
						{:else if !editor.loadedFiles.has(name)}
							<span class="raw-panel-load">- click to load</span>
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
						<p class="raw-panel-decoding">Decoding…</p>
					{/if}
				</details>
			{/each}
			<p class="raw-panel-foot">
				Not editable here: {OPAQUE_FILES.join(', ')} (raw terrain data and PNG images rather than
				serialized objects).
			</p>
		</div>
	</Section>
{/if}

<style>
	.raw-panel-body {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* Body copy in the same quiet grey the rest of the editor uses for hints. */
	.raw-panel-note {
		font-size: var(--text-ui-xs);
		line-height: var(--text-ui-xs--line-height);
		color: var(--color-muted);
	}
	.raw-panel-note code {
		color: var(--color-stone);
	}
	.raw-panel-foot {
		font-size: var(--text-ui-xs);
		line-height: var(--text-ui-xs--line-height);
		color: var(--color-edge);
	}

	/* Each file is its own quiet slab inside the card, square like the frame. */
	.raw-panel-file {
		background-color: var(--color-void);
		border: 2px solid var(--color-edge-dim);
		padding: 0.5rem 0.75rem;
	}
	/* File names are data rather than interface, so they read in the DOS face the
	   module cards use for their body copy, at its usual size and grey. The row is
	   a flex line so the marker sits on the middle of the text: 000webfont's line
	   box is shorter than its em box, which left the UA triangle riding high above
	   the name. */
	.raw-panel-file-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-desc);
		font-size: 18px;
		line-height: 1.35;
		letter-spacing: normal;
		color: var(--color-stone);
		cursor: pointer;
		user-select: none;
	}
	/* Being a flex box already takes the summary off `list-item` and with it the
	   UA triangle; Safari draws its own marker that has to go separately. */
	.raw-panel-file-title::-webkit-details-marker {
		display: none;
	}
	/* The marker, redrawn in glyphs code page 437 actually carries, so it is on the
	   same pixel grid as the name beside it. */
	.raw-panel-file-title::before {
		content: '►';
		color: var(--color-edge);
	}
	.raw-panel-file[open] > .raw-panel-file-title::before {
		content: '▼';
	}
	.raw-panel-mod {
		font-size: inherit;
		color: var(--color-accent);
	}
	.raw-panel-load {
		font-size: inherit;
		color: var(--color-edge);
	}
	.raw-panel-decoding {
		margin-top: 0.5rem;
		font-size: var(--text-ui-xs);
		line-height: var(--text-ui-xs--line-height);
		color: var(--color-muted);
	}
</style>
