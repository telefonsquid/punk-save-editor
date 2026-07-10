<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import RawTree from '$lib/components/RawTree.svelte';
	import { canPickFolder, pickSaveDir } from '$lib/save/io';
	import {
		addConsumable,
		addIngredient,
		assets,
		assetsByCategory,
		displayName,
		getConsumables,
		getModules,
		getResources,
		ingredientCounts,
		ingredientIds,
		loadFile,
		loadSlot,
		ODIN_FILES,
		OPAQUE_FILES,
		runStats,
		saveSlot,
		type SaveSlot
	} from '$lib/save/slot';

	let slot = $state<SaveSlot | null>(null);
	const dirtyFiles = new SvelteSet<string>();
	const dirty = $derived(dirtyFiles.size > 0);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let statusMessage = $state<string | null>(null);
	let rawLoading = $state<string | null>(null);

	const stats = $derived(slot ? runStats(slot.rundata) : null);
	const resources = $derived(slot ? getResources(slot.rundata) : []);
	const ingIds = $derived(slot ? ingredientIds(slot.vault) : []);
	const ingCounts = $derived(slot ? ingredientCounts(slot.vault) : []);
	const consumables = $derived(slot ? getConsumables(slot.vault) : []);
	const modules = $derived(slot ? getModules(slot.vault) : []);

	const allIngredients = assetsByCategory('Ingredient');
	const allConsumables = assetsByCategory('Consumable');
	const addableIngredients = $derived(allIngredients.filter(({ id }) => !ingIds.includes(id)));
	const addableConsumables = $derived(
		allConsumables.filter(({ id }) => !consumables.some((c) => c.consumableId === id))
	);

	let ingredientToAdd = $state('');
	let consumableToAdd = $state('');

	async function open() {
		error = null;
		statusMessage = null;
		try {
			const dir = await pickSaveDir();
			if (!dir) return;
			busy = true;
			slot = await loadSlot(dir);
			dirtyFiles.clear();
			statusMessage = `Loaded "${dir.name}"`;
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}

	async function save() {
		if (!slot || dirtyFiles.size === 0) return;
		error = null;
		statusMessage = null;
		busy = true;
		try {
			const names = [...dirtyFiles];
			await saveSlot(slot, names);
			dirtyFiles.clear();
			statusMessage = `Saved ${names.join(', ')}. Originals were backed up as *.bak.`;
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}

	function markCurated() {
		dirtyFiles.add('vault');
		dirtyFiles.add('rundata');
	}

	async function openRawFile(name: string, opened: boolean) {
		if (!opened || !slot || slot.files[name] || rawLoading) return;
		rawLoading = name;
		error = null;
		try {
			await loadFile(slot, name);
		} catch (err) {
			error = (err as Error).message;
		} finally {
			rawLoading = null;
		}
	}

	function formatDuration(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		return `${h}h ${String(m).padStart(2, '0')}m`;
	}

	function connections(m: {
		northConnection: boolean;
		eastConnection: boolean;
		southConnection: boolean;
		westConnection: boolean;
	}): string {
		const parts = [
			m.northConnection && 'N',
			m.eastConnection && 'E',
			m.southConnection && 'S',
			m.westConnection && 'W'
		].filter(Boolean);
		return parts.length ? parts.join('·') : 'none';
	}
</script>

<svelte:head><title>PUNK Save Editor</title></svelte:head>

<div class="min-h-screen bg-zinc-950 text-zinc-100">
	<header
		class="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-zinc-800 bg-zinc-950/95 px-6 py-3"
	>
		<h1 class="text-lg font-bold tracking-widest text-lime-400 uppercase">Punk Save Editor</h1>
		<div class="flex-1"></div>
		{#if slot}
			<span class="text-sm text-zinc-400">{slot.dir.name}</span>
		{/if}
		<button
			class="rounded border border-zinc-700 px-3 py-1.5 text-sm font-semibold hover:border-lime-400 hover:text-lime-400 disabled:opacity-40"
			onclick={open}
			disabled={busy}
		>
			Open save folder
		</button>
		<button
			class="rounded bg-lime-500 px-4 py-1.5 text-sm font-bold text-zinc-950 hover:bg-lime-400 disabled:opacity-40"
			onclick={save}
			disabled={!slot || !dirty || busy}
		>
			Save changes
		</button>
	</header>

	<main class="mx-auto max-w-5xl space-y-6 px-6 py-6">
		{#if error}
			<p class="rounded border border-red-700 bg-red-950 px-4 py-2 text-sm text-red-300">
				{error}
			</p>
		{/if}
		{#if statusMessage}
			<p class="rounded border border-lime-800 bg-lime-950 px-4 py-2 text-sm text-lime-300">
				{statusMessage}
			</p>
		{/if}

		{#if !slot}
			<div class="rounded-lg border border-dashed border-zinc-700 p-12 text-center text-zinc-400">
				<p class="mb-2 text-lg">Open a PUNK save folder to start editing.</p>
				<p class="text-sm">
					Saves live in
					<code class="rounded bg-zinc-900 px-1.5 py-0.5 text-xs"
						>%USERPROFILE%\AppData\LocalLow\DefaultCompany\Punk\saves\save001</code
					>
				</p>
				{#if !canPickFolder()}
					<p class="mt-4 text-sm text-amber-400">
						This browser can't open local folders — use a Chromium-based browser (Chrome, Edge) or
						the desktop app.
					</p>
				{/if}
				<p class="mt-4 text-xs text-zinc-500">
					Close the game before editing — it keeps saves in memory while running.
				</p>
			</div>
		{:else}
			<div class="grid gap-6 md:grid-cols-2" oninput={markCurated}>
				<section class="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
					<h2 class="mb-4 text-sm font-bold tracking-widest text-fuchsia-400 uppercase">
						Resources
					</h2>
					{#each resources as pair (pair.$k)}
						<label class="mb-2 flex items-center justify-between gap-4">
							<span>{displayName(pair.$k)}</span>
							<input
								type="number"
								class="w-32 rounded border-zinc-700 bg-zinc-900 text-right"
								bind:value={pair.$v}
							/>
						</label>
					{:else}
						<p class="text-sm text-zinc-500">No resources in this save.</p>
					{/each}
				</section>

				<section class="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
					<h2 class="mb-4 text-sm font-bold tracking-widest text-fuchsia-400 uppercase">
						Run stats
					</h2>
					{#if stats}
						<label class="mb-2 flex items-center justify-between gap-4">
							<span>Enemies killed</span>
							<input
								type="number"
								class="w-32 rounded border-zinc-700 bg-zinc-900 text-right"
								bind:value={stats.killedEnemyCount}
							/>
						</label>
						<label class="mb-2 flex items-center justify-between gap-4">
							<span>Bosses killed</span>
							<input
								type="number"
								class="w-32 rounded border-zinc-700 bg-zinc-900 text-right"
								bind:value={stats.killedBossCount}
							/>
						</label>
						<label class="mb-2 flex items-center justify-between gap-4">
							<span>
								Run time
								<span class="text-zinc-500">({formatDuration(stats.totalRunTime)})</span>
							</span>
							<input
								type="number"
								step="any"
								class="w-32 rounded border-zinc-700 bg-zinc-900 text-right"
								bind:value={stats.totalRunTime}
							/>
						</label>
					{/if}
				</section>

				<section class="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
					<h2 class="mb-4 text-sm font-bold tracking-widest text-fuchsia-400 uppercase">
						Vault · Ingredients
					</h2>
					{#each ingIds as id, i (id)}
						<label class="mb-2 flex items-center justify-between gap-4">
							<span>{displayName(id)}</span>
							<input
								type="number"
								min="0"
								class="w-32 rounded border-zinc-700 bg-zinc-900 text-right"
								bind:value={ingCounts[i]}
							/>
						</label>
					{:else}
						<p class="text-sm text-zinc-500">Vault has no ingredients.</p>
					{/each}
					{#if addableIngredients.length > 0}
						<div class="mt-4 flex gap-2 border-t border-zinc-800 pt-3">
							<select
								class="flex-1 rounded border-zinc-700 bg-zinc-900 text-sm"
								bind:value={ingredientToAdd}
							>
								<option value="" disabled>Add ingredient…</option>
								{#each addableIngredients as { id } (id)}
									<option value={id}>{displayName(id)}</option>
								{/each}
							</select>
							<button
								class="rounded border border-zinc-700 px-3 text-sm hover:border-lime-400 hover:text-lime-400 disabled:opacity-40"
								disabled={!ingredientToAdd}
								onclick={() => {
									if (slot && ingredientToAdd) {
										addIngredient(slot.vault, ingredientToAdd, 1);
										ingredientToAdd = '';
										markCurated();
									}
								}}
							>
								Add
							</button>
						</div>
					{/if}
				</section>

				<section class="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
					<h2 class="mb-4 text-sm font-bold tracking-widest text-fuchsia-400 uppercase">
						Vault · Consumables
					</h2>
					{#each consumables as c, i (i)}
						<label class="mb-2 flex items-center justify-between gap-4">
							<span>
								{displayName(c.consumableId)}
								{#if c.consumableId && assets[c.consumableId]?.maxCount}
									<span class="text-xs text-zinc-500">max {assets[c.consumableId].maxCount}</span>
								{/if}
							</span>
							<input
								type="number"
								min="0"
								class="w-32 rounded border-zinc-700 bg-zinc-900 text-right"
								bind:value={c.amount}
							/>
						</label>
					{:else}
						<p class="text-sm text-zinc-500">Vault has no consumables.</p>
					{/each}
					{#if addableConsumables.length > 0}
						<div class="mt-4 flex gap-2 border-t border-zinc-800 pt-3">
							<select
								class="flex-1 rounded border-zinc-700 bg-zinc-900 text-sm"
								bind:value={consumableToAdd}
							>
								<option value="" disabled>Add consumable…</option>
								{#each addableConsumables as { id } (id)}
									<option value={id}>{displayName(id)}</option>
								{/each}
							</select>
							<button
								class="rounded border border-zinc-700 px-3 text-sm hover:border-lime-400 hover:text-lime-400 disabled:opacity-40"
								disabled={!consumableToAdd}
								onclick={() => {
									if (slot && consumableToAdd) {
										addConsumable(slot.vault, consumableToAdd, 1);
										consumableToAdd = '';
										markCurated();
									}
								}}
							>
								Add
							</button>
						</div>
					{/if}
				</section>

				<section class="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 md:col-span-2">
					<h2 class="mb-4 text-sm font-bold tracking-widest text-fuchsia-400 uppercase">
						Vault · Modules
					</h2>
					{#if modules.length === 0}
						<p class="text-sm text-zinc-500">Vault has no modules.</p>
					{:else}
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b border-zinc-800 text-left text-xs text-zinc-500 uppercase">
									<th class="py-2 pr-4">Module</th>
									<th class="py-2 pr-4">Tier</th>
									<th class="py-2 pr-4">Connections</th>
									<th class="py-2 text-right">Power level</th>
								</tr>
							</thead>
							<tbody>
								{#each modules as m, i (i)}
									<tr class="border-b border-zinc-800/50">
										<td class="py-2 pr-4">
											{displayName(m.moduleDataId)}
											{#if m.moduleDataId && assets[m.moduleDataId]?.description}
												<div class="max-w-md truncate text-xs text-zinc-500">
													{assets[m.moduleDataId].description}
												</div>
											{/if}
										</td>
										<td class="py-2 pr-4 text-zinc-400">
											{m.moduleDataId ? (assets[m.moduleDataId]?.level ?? '—') : '—'}
										</td>
										<td class="py-2 pr-4 text-zinc-400">{connections(m)}</td>
										<td class="py-2 text-right">
											<input
												type="number"
												min="0"
												class="w-24 rounded border-zinc-700 bg-zinc-900 text-right"
												bind:value={m.powerLevel}
											/>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</section>
			</div>

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
							ontoggle={(e) => openRawFile(name, e.currentTarget.open)}
						>
							<summary class="cursor-pointer text-sm font-semibold text-zinc-300 select-none">
								{name}
								{#if dirtyFiles.has(name)}
									<span class="text-xs text-amber-400">· modified</span>
								{:else if !slot.files[name]}
									<span class="text-xs text-zinc-600">· click to load</span>
								{/if}
							</summary>
							{#if slot.files[name]}
								<div class="mt-2">
									<RawTree
										container={slot.files}
										key={name}
										label="root"
										ondirty={() => dirtyFiles.add(name)}
									/>
								</div>
							{:else if rawLoading === name}
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
	</main>
</div>
