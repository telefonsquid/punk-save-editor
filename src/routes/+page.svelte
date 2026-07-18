<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import RawTree from '$lib/components/RawTree.svelte';
	import ResourceIcon from '$lib/components/ResourceIcon.svelte';
	import ItemIcon from '$lib/components/ItemIcon.svelte';
	import { isDownloadDir, pickSaveDir, supportsInPlaceSave, type SaveDir } from '$lib/save/io';
	import {
		addConsumable,
		addIngredient,
		addModule,
		assets,
		assetsByCategory,
		CONNECTION_SIDES,
		displayName,
		getConsumables,
		getModules,
		getResources,
		ingredientCounts,
		ingredientIds,
		loadFile,
		loadSlot,
		moduleInfo,
		ODIN_FILES,
		OPAQUE_FILES,
		removeModule,
		reorderConsumables,
		runStats,
		saveSlot,
		shipResourceCaps,
		shipResources,
		type ConnectionKey,
		type ModuleView,
		type ResourcePair,
		type SaveSlot
	} from '$lib/save/slot';

	// The decoded save trees are huge plain-object graphs and deliberately NOT
	// deep-reactive: a deep $state proxy stores mutations in its own signal
	// storage and never writes them back to the underlying objects, so the
	// serializer would save stale data. The UI mutates the raw trees directly
	// and bumps `version` to refresh the derived views below.
	let slot = $state.raw<SaveSlot | null>(null);
	let version = $state(0);
	const dirtyFiles = new SvelteSet<string>();
	const loadedFiles = new SvelteSet<string>();
	const dirty = $derived(dirtyFiles.size > 0);
	// Firefox/Safari can't write in place; saving downloads a zip instead.
	const downloadMode = $derived(!!slot && isDownloadDir(slot.dir));
	let busy = $state(false);
	let error = $state<string | null>(null);
	let statusMessage = $state<string | null>(null);
	let rawLoading = $state<string | null>(null);

	const views = $derived.by(() => {
		if (version < 0 || !slot) return null; // reading `version` makes edits invalidate these
		return {
			stats: runStats(slot.rundata),
			runTime: formatDuration(runStats(slot.rundata).totalRunTime),
			resources: [...getResources(slot.rundata)],
			ingIds: [...ingredientIds(slot.vault)],
			ingCounts: ingredientCounts(slot.vault),
			consumables: [...getConsumables(slot.vault)],
			modules: [...getModules(slot.vault)]
		};
	});
	// Ship resources live in the (lazily loaded) entities file; max values are
	// derived from the installed grid modules, so recompute both on every edit.
	// The rows snapshot $k/$v into fresh objects: the pairs themselves keep
	// their identity across recomputes, so expressions reading them directly
	// would not re-render inside the keyed each.
	const shipView = $derived.by(() => {
		if (version < 0 || !slot || !loadedFiles.has('entities')) return null;
		const entities = slot.files.entities;
		const caps = shipResourceCaps(entities);
		const rows = shipResources(entities).map((pair) => ({
			pair,
			id: pair.$k,
			value: pair.$v,
			max: caps.get(pair.$k)
		}));
		return { rows };
	});

	const stats = $derived(views?.stats ?? null);
	const runTime = $derived(views?.runTime ?? '');
	const resources = $derived(views?.resources ?? []);
	const ingIds = $derived(views?.ingIds ?? []);
	const ingCounts = $derived(views?.ingCounts ?? []);
	const consumables = $derived(views?.consumables ?? []);
	const modules = $derived(views?.modules ?? []);

	// Ingredients that exist in the game data but are unused in the current build
	// (never obtainable in a run) — hidden from the editor to avoid confusion,
	// but kept in the asset data so they reappear if a future build uses them.
	const DISABLED_INGREDIENTS = new Set(['Bond', 'Ex', 'Face']);
	const allIngredients = assetsByCategory('Ingredient').filter(
		({ id }) => !DISABLED_INGREDIENTS.has(id)
	);
	const allConsumables = assetsByCategory('Consumable');
	// Only modules the game considers equippable (ModuleData.Equippable: an icon
	// plus a display name) can be offered — the rest are embedded enemy parts.
	const allModules = assetsByCategory('Module').filter(({ info }) => info.displayName);

	// Only the filled slots are shown; empty ("(none)") slots are surfaced as
	// add buttons instead. Reordering acts on this filtered list.
	const filledConsumables = $derived(consumables.filter((c) => c.consumableId));
	const addableConsumables = $derived(
		allConsumables.filter(({ id }) => !consumables.some((c) => c.consumableId === id))
	);
	// Index (into filledConsumables) of the row currently being dragged.
	let dragIndex = $state<number | null>(null);
	// Module id chosen in the "add a module" picker (a plain string, not save data).
	let moduleToAdd = $state('');

	// A derived recompute reuses the underlying module nodes, so the keyed
	// {#each} would not notice an edited connection if the template read the node
	// directly. Snapshot every scalar the rows render into fresh objects.
	const moduleRows = $derived(
		modules.map((m, index) => ({
			module: m,
			index,
			id: m.moduleDataId,
			powerLevel: m.powerLevel,
			info: moduleInfo(m.moduleDataId),
			connections: Object.fromEntries(
				CONNECTION_SIDES.map(({ key }) => [key, m[key]])
			) as Record<ConnectionKey, boolean>
		}))
	);

	// The vault only stores ingredients the player actually owns, but the UI
	// shows every ingredient (owned or not) so counts can be raised from zero.
	// This maps id -> owned count for the display; missing ids read as 0.
	const ingCountById = $derived.by(() => {
		const m: Record<string, number> = {};
		ingIds.forEach((id, i) => (m[id] = ingCounts[i]));
		return m;
	});

	/** Flips one grid connection of a module in the raw tree. */
	function toggleConnection(m: ModuleView, key: ConnectionKey) {
		m[key] = !m[key];
		markCurated();
		refreshViews();
	}

	function addModuleToVault() {
		if (!slot || !moduleToAdd) return;
		addModule(slot.vault, moduleToAdd);
		moduleToAdd = '';
		markCurated();
		refreshViews();
	}

	function removeModuleAt(index: number) {
		if (!slot) return;
		removeModule(slot.vault, index);
		markCurated();
		refreshViews();
	}

	/** Finish a consumable drag: move the dragged row to slot `to`. */
	function dropConsumable(to: number) {
		if (slot && dragIndex !== null && dragIndex !== to) {
			reorderConsumables(slot.vault, dragIndex, to);
			markCurated();
			refreshViews();
		}
		dragIndex = null;
	}

	async function open() {
		error = null;
		statusMessage = null;
		try {
			const dir = (import.meta.env.DEV && devTestDir()) || (await pickSaveDir());
			if (!dir) return;
			busy = true;
			slot = await loadSlot(dir);
			dirtyFiles.clear();
			loadedFiles.clear();
			for (const name of Object.keys(slot.files)) loadedFiles.add(name);
			// Ship resources live in the heavier `entities` file; load it up front
			// so they show without a click. A save without it is still openable.
			try {
				await loadFile(slot, 'entities');
				loadedFiles.add('entities');
			} catch {
				/* no entities file — the ship section falls back to its notice */
			}
			version++;
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
			if (isDownloadDir(slot.dir)) {
				slot.dir.exportChanges();
				statusMessage =
					`Downloaded "${slot.dir.name}-edited.zip" (${names.join(', ')} + *.bak backups). ` +
					`Extract it into your save folder to apply the changes.`;
			} else {
				statusMessage = `Saved ${names.join(', ')}. Originals were backed up as *.bak.`;
			}
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

	function refreshViews() {
		version++;
	}

	/** Dev-only escape hatch so automated tests can inject an in-memory SaveDir. */
	function devTestDir(): SaveDir | null {
		return (window as unknown as { __punkTestDir?: SaveDir }).__punkTestDir ?? null;
	}

	/** oninput handler that writes a finite number straight into the raw tree. */
	function numInput(target: object, prop: string | number) {
		return (e: Event) => {
			const el = e.currentTarget as HTMLInputElement;
			const n = Number(el.value);
			if (el.value !== '' && Number.isFinite(n)) {
				(target as Record<string | number, unknown>)[prop] = n;
			}
		};
	}

	/** oninput for an ingredient row: writes the count into the vault by id,
	 * inserting the ingredient if the player didn't own it yet (0 stays 0). */
	function ingredientInput(id: string) {
		return (e: Event) => {
			if (!slot) return;
			const el = e.currentTarget as HTMLInputElement;
			const n = Number(el.value);
			if (el.value === '' || !Number.isFinite(n)) return;
			const v = Math.max(0, Math.round(n));
			if (v !== n) el.value = String(v);
			addIngredient(slot.vault, id, v);
			dirtyFiles.add('vault');
		};
	}

	/** Like numInput for a ship resource, clamped to [0, max]. Negative values
	 * are known to crash the game on load, over-max gets clamped in play. */
	function shipResInput(pair: ResourcePair, max: number | undefined) {
		return (e: Event) => {
			const el = e.currentTarget as HTMLInputElement;
			const n = Number(el.value);
			if (el.value === '' || !Number.isFinite(n)) return;
			let v = Math.max(0, n);
			if (max !== undefined) v = Math.min(v, max);
			if (v !== n) el.value = String(v);
			pair.$v = v;
			dirtyFiles.add('entities');
		};
	}

	function shipResourceLabel(id: string): string {
		return id.replace(/^Resource /, '');
	}

	/** Displays a float with at most one decimal. Only the *display* is rounded —
	 * the tree keeps whatever precision the game wrote (and whatever the user
	 * types), so saving never quietly truncates a value that wasn't edited. */
	function fmt1(v: number): string {
		return Number.isInteger(v) ? String(v) : v.toFixed(1);
	}

	async function openRawFile(name: string, opened: boolean) {
		if (!opened || !slot || loadedFiles.has(name) || rawLoading) return;
		rawLoading = name;
		error = null;
		try {
			await loadFile(slot, name);
			loadedFiles.add(name);
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
			{downloadMode ? 'Download changes' : 'Save changes'}
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
		{#if downloadMode}
			<p class="rounded border border-amber-800 bg-amber-950/50 px-4 py-2 text-xs text-amber-300">
				This browser edits in memory. <strong>Download changes</strong> gives you a zip — extract it
				into your save folder to apply it (it includes <code>.bak</code> backups). Close the game first.
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
			<section
				class="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5"
				onchange={refreshViews}
			>
				<h2 class="mb-4 text-sm font-bold tracking-widest text-fuchsia-400 uppercase">
					Ship resources
				</h2>
				{#if !shipView}
					<p class="mb-3 text-sm text-zinc-400">
						Current fuel, health, ammo etc. are stored with the ship in the
						<code class="text-xs">entities</code> file, which isn't present in this save.
					</p>
					<button
						class="rounded border border-zinc-700 px-3 py-1.5 text-sm font-semibold hover:border-lime-400 hover:text-lime-400 disabled:opacity-40"
						disabled={rawLoading !== null}
						onclick={() => openRawFile('entities', true)}
					>
						{rawLoading === 'entities' ? 'Decoding…' : 'Retry loading ship resources'}
					</button>
				{:else if shipView.rows.length === 0}
					<p class="text-sm text-zinc-500">No ship with resource tanks found in this save.</p>
				{:else}
					<div class="grid gap-x-8 md:grid-cols-2">
						{#each shipView.rows as row (row.id)}
							{@const outOfRange = row.value < 0 || (row.max !== undefined && row.value > row.max)}
							<label class="mb-2 flex items-center justify-between gap-4">
								<span class="flex items-center gap-2">
									<ResourceIcon id={row.id} class="h-8 w-8 shrink-0" />
									{shipResourceLabel(row.id)}
									{#if outOfRange}
										<span class="text-xs text-red-400">out of range — may crash the game</span>
									{/if}
								</span>
								<span class="flex items-baseline gap-2">
									<input
										type="number"
										step="any"
										min="0"
										max={row.max !== undefined ? row.max : undefined}
										class="w-32 rounded border-zinc-700 bg-zinc-900 text-right"
										value={fmt1(row.value)}
										oninput={shipResInput(row.pair, row.max)}
									/>
									<span class="w-14 text-sm text-zinc-500">
										/ {row.max !== undefined ? fmt1(row.max) : '?'}
									</span>
								</span>
							</label>
						{/each}
					</div>
					<p class="mt-2 text-xs text-zinc-600">
						Max values are derived from the modules installed on the ship grid and update as you edit
						them; edits are clamped to the max.
					</p>
				{/if}
			</section>

			<div class="grid gap-6 md:grid-cols-2" oninput={markCurated} onchange={refreshViews}>
				<section class="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
					<h2 class="mb-4 text-sm font-bold tracking-widest text-fuchsia-400 uppercase">
						Resources
					</h2>
					{#each resources as pair (pair.$k)}
						<label class="mb-2 flex items-center justify-between gap-4">
							<span class="flex items-center gap-2">
								<ResourceIcon id={pair.$k} class="h-8 w-8 shrink-0" />
								{displayName(pair.$k)}
							</span>
							<input
								type="number"
								step="any"
								class="w-32 rounded border-zinc-700 bg-zinc-900 text-right"
								value={fmt1(pair.$v)}
								oninput={numInput(pair, '$v')}
							/>
						</label>
					{/each}
					<!-- Every ingredient is listed, even ones the player doesn't own yet
					     (shown as 0); raising a count from zero inserts it into the vault. -->
					{#each allIngredients as { id } (id)}
						<label class="mb-2 flex items-center justify-between gap-4">
							<span class="flex items-center gap-2">
								<ItemIcon {id} class="h-8 w-8 shrink-0" />
								{displayName(id)}
							</span>
							<input
								type="number"
								min="0"
								class="w-32 rounded border-zinc-700 bg-zinc-900 text-right"
								value={ingCountById[id] ?? 0}
								oninput={ingredientInput(id)}
							/>
						</label>
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
								value={stats.killedEnemyCount}
								oninput={numInput(stats, 'killedEnemyCount')}
							/>
						</label>
						<label class="mb-2 flex items-center justify-between gap-4">
							<span>Bosses killed</span>
							<input
								type="number"
								class="w-32 rounded border-zinc-700 bg-zinc-900 text-right"
								value={stats.killedBossCount}
								oninput={numInput(stats, 'killedBossCount')}
							/>
						</label>
						<label class="mb-2 flex items-center justify-between gap-4">
							<span>
								Run time
								<span class="text-zinc-500">({runTime})</span>
							</span>
							<input
								type="number"
								step="any"
								class="w-32 rounded border-zinc-700 bg-zinc-900 text-right"
								value={fmt1(stats.totalRunTime)}
								oninput={numInput(stats, 'totalRunTime')}
							/>
						</label>
					{/if}
				</section>

				<section class="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
					<h2 class="mb-4 text-sm font-bold tracking-widest text-fuchsia-400 uppercase">
						Vault · Consumables
					</h2>
					<ul class="list-none">
						{#each filledConsumables as c, i (c.consumableId)}
							<!-- Drag a row onto another to reorder the inventory slots. -->
							<li
								role="listitem"
								class="mb-2 flex items-center justify-between gap-4 rounded {dragIndex === i
									? 'opacity-40'
									: ''}"
								ondragover={(e) => e.preventDefault()}
								ondrop={() => dropConsumable(i)}
							>
								<span class="flex items-center gap-2">
									<button
										type="button"
										class="cursor-move px-1 text-zinc-600 select-none hover:text-zinc-300"
										draggable="true"
										aria-label="Drag to reorder {displayName(c.consumableId)}"
										ondragstart={() => (dragIndex = i)}
										ondragend={() => (dragIndex = null)}
									>
										⠿
									</button>
									<ItemIcon id={c.consumableId} class="h-10 w-10 shrink-0" />
									{displayName(c.consumableId)}
									{#if c.consumableId && assets[c.consumableId]?.maxCount}
										<span class="text-xs text-zinc-500">max {assets[c.consumableId].maxCount}</span>
									{/if}
								</span>
								<input
									type="number"
									min="0"
									class="w-32 rounded border-zinc-700 bg-zinc-900 text-right"
									value={c.amount}
									oninput={numInput(c, 'amount')}
								/>
							</li>
						{:else}
							<p class="text-sm text-zinc-500">Vault has no consumables.</p>
						{/each}
					</ul>
					{#if addableConsumables.length > 0}
						<div class="mt-4 flex flex-wrap gap-2 border-t border-zinc-800 pt-3">
							{#each addableConsumables as { id } (id)}
								<button
									class="flex items-center gap-1.5 rounded border border-zinc-700 px-2.5 py-1 text-sm hover:border-lime-400 hover:text-lime-400"
									onclick={() => {
										if (slot) {
											addConsumable(slot.vault, id, 1);
											markCurated();
											refreshViews();
										}
									}}
								>
									<ItemIcon {id} class="h-7 w-7 shrink-0" />
									Add {displayName(id)}
								</button>
							{/each}
						</div>
					{/if}
				</section>

				<section class="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 md:col-span-2">
					<h2 class="mb-4 text-sm font-bold tracking-widest text-fuchsia-400 uppercase">
						Vault · Modules
					</h2>
					{#if moduleRows.length === 0}
						<p class="text-sm text-zinc-500">Vault has no modules.</p>
					{:else}
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b border-zinc-800 text-left text-xs text-zinc-500 uppercase">
									<th class="py-2 pr-4">Module</th>
									<th class="py-2 pr-4">Tier</th>
									<th class="py-2 pr-4">Connections</th>
									<th class="py-2 pr-4 text-right">Max power cores</th>
									<th class="py-2"><span class="sr-only">Remove</span></th>
								</tr>
							</thead>
							<tbody>
								{#each moduleRows as row (row.index)}
									<tr class="border-b border-zinc-800/50">
										<td class="py-2 pr-4">
											<div class="flex items-center gap-2">
												<!-- Modules share a ColorAsset with the resource they belong
												     to, which is what tints them in the game itself. -->
												<span
													class="h-9 w-1 shrink-0 rounded-full"
													style:background-color={row.info?.color ?? '#52525b'}
												></span>
												<ItemIcon id={row.id} class="h-10 w-10 shrink-0" />
												<div>
													<span style:color={row.info?.color ?? undefined}>
														{displayName(row.id)}
													</span>
													{#if row.info?.resource}
														<span class="ml-1 text-xs text-zinc-500">
															{shipResourceLabel(row.info.resource)}
														</span>
													{/if}
													{#if row.id && assets[row.id]?.description}
														<div class="max-w-md truncate text-xs text-zinc-500">
															{assets[row.id].description}
														</div>
													{/if}
												</div>
											</div>
										</td>
										<td class="py-2 pr-4 text-zinc-400">
											{row.id ? (assets[row.id]?.level ?? '—') : '—'}
										</td>
										<td class="py-2 pr-4">
											<div class="flex gap-1">
												{#each CONNECTION_SIDES as side (side.key)}
													<button
														type="button"
														class="h-7 w-7 rounded border text-xs font-semibold {row.connections[
															side.key
														]
															? 'border-lime-400 bg-lime-400/20 text-lime-300'
															: 'border-zinc-700 text-zinc-600 hover:border-zinc-500'}"
														aria-pressed={row.connections[side.key]}
														aria-label="{side.label} connection of {displayName(row.id)}"
														onclick={() => toggleConnection(row.module, side.key)}
													>
														{side.label}
													</button>
												{/each}
											</div>
										</td>
										<td class="py-2 pr-4 text-right">
											<input
												type="number"
												min="0"
												class="w-24 rounded border-zinc-700 bg-zinc-900 text-right"
												value={row.powerLevel}
												oninput={numInput(row.module, 'powerLevel')}
											/>
										</td>
										<td class="py-2 text-right">
											<button
												type="button"
												class="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-500 hover:border-red-500 hover:text-red-400"
												aria-label="Remove {displayName(row.id)} from the vault"
												onclick={() => removeModuleAt(row.index)}
											>
												Remove
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
					<div class="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
						<select
							class="rounded border-zinc-700 bg-zinc-900 py-1 text-sm"
							aria-label="Module to add to the vault"
							bind:value={moduleToAdd}
						>
							<option value="">Add a module…</option>
							{#each allModules as { id } (id)}
								<option value={id}>{displayName(id)}</option>
							{/each}
						</select>
						<button
							type="button"
							class="rounded border border-zinc-700 px-3 py-1 text-sm font-semibold hover:border-lime-400 hover:text-lime-400 disabled:opacity-40"
							disabled={!moduleToAdd}
							onclick={addModuleToVault}
						>
							Add to vault
						</button>
						<span class="text-xs text-zinc-600">
							Added with all four connections and the module's highest power-core capacity.
						</span>
					</div>
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
								{:else if !loadedFiles.has(name)}
									<span class="text-xs text-zinc-600">· click to load</span>
								{/if}
							</summary>
							{#if loadedFiles.has(name)}
								<div class="mt-2">
									<RawTree
										container={slot.files}
										key={name}
										label="root"
										ondirty={() => {
											dirtyFiles.add(name);
											refreshViews();
										}}
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
