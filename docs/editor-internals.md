# Editor internals

How the SvelteKit app is wired, and the non-obvious rules that keep saves from silently corrupting.
Stack: SvelteKit 2 + **Svelte 5 runes**, Tailwind 4, **bun**, Tauri 2 (fs + dialog plugins). Runs as
both a website and a desktop app from one codebase (`adapter-static`, `ssr = false`).

## Commands

```bash
bun run dev      # vite dev server (port 5173, or $PORT — see vite.config.ts)
bun run check    # svelte-kit sync + svelte-check (the real gate; also checks .svelte files)
bun run lint     # eslint
bun run build    # adapter-static production build
```

`bun run check` is the type gate — plain `tsc` misses everything inside `.svelte`. Always run the
Svelte MCP `svelte-autofixer` on any component you touch before finishing (repeat until clean); it's a
hard project rule.

## Layers

```
io.ts        SaveDir  { name, read(name), write(name,bytes), exists(name) }
             pickSaveDir() -> Tauri fs | Chromium FSA | Firefox/Safari upload+download
zip.ts       makeZip(entries)  (store-only ZIP for the download fallback)
   |
lzf.ts       lzfDecompress / lzfCompress  (CLZF2 port; see save-format.md)
odin.ts      OdinBinaryReader.parse / .parseMembers, OdinBinaryWriter.write, EntryType, isNode
   |
slot.ts      loadSlot / loadFile / saveSlot  +  typed accessors over the decoded trees
   |
routes/+page.svelte   the whole editor UI
components/RawTree.svelte   recursive "modify at your own risk" tree editor
```

`SaveDir` abstracts *where* files come from, so the same code runs against a Tauri folder, a browser
folder handle, or an in-memory test dir. `pickSaveDir()` picks a backend by capability:

- **Tauri** — `@tauri-apps/plugin-fs`, in place.
- **Chromium** — File System Access API (`showDirectoryPicker`), in place.
- **Firefox/Safari** — neither can write a real folder, so `pickWebUpload()` returns a
  `DownloadSaveDir`: the user picks the folder via a directory `<input>`, every file is read into an
  in-memory `Map`, writes accumulate there, and `exportChanges()` hands back a zip (changed files +
  their `.bak` originals) built by `zip.ts` (a from-scratch store-only ZIP writer — save files are
  already LZF-compressed). `supportsInPlaceSave()` gates the UI; `isDownloadDir()` switches the Save
  button to "Download changes". The save codec, accessors, and `saveSlot` are unchanged — only the
  `SaveDir` differs.

`loadSlot` eagerly loads `levelinfo`/`vault`/`rundata`;
`loadFile(slot, name)` lazily loads and caches the heavier optional files (`entities`, `graph`,
`mapicons`) into `slot.files`. `saveSlot(slot, names)` writes only the named files, backing up each
original to `*.bak` **once** before the first overwrite.

## The load-bearing Svelte 5 rule: no deep `$state` on save trees

**A deep `$state` proxy stores mutations in its own signal storage and never writes them back to the
underlying object.** The serializer reads the raw objects, so if the UI edited through a proxy, saves
silently wrote the *pristine* tree (creating `.bak`s but byte-identical files). Worse, aliased paths
(`slot.rundata` vs `slot.files.rundata`, same raw object) get *independent* proxies. This was the
"edits don't persist" bug (commit 04e672d). Rules that follow from it:

- Save trees live in **`$state.raw`** (`let slot = $state.raw<SaveSlot|null>(null)`). Never wrap the
  Odin trees in deep `$state` — also avoids allocating a signal per property of the ~7 MB `entities`
  tree.
- **All inputs write straight into the raw tree** via `oninput` handlers (`numInput`, `shipResInput`),
  never `bind:value` into a proxied path. The handler mutates the exact object the writer serializes.
- UI refresh is driven explicitly: a `let version = $state(0)` counter, bumped by `refreshViews()`,
  and reactive `SvelteSet`s (`dirtyFiles`, `loadedFiles`). Derived views read `version` so edits
  invalidate them. `markCurated()` marks `vault`+`rundata` dirty; `dirtyFiles.add('entities')` for ship
  edits. version bumps on `change`/blur, not every `input`, so in-progress decimal typing isn't
  clobbered.
- Because a derived recompute keeps the same underlying object identity, snapshot the scalars you want
  the keyed `{#each}` to react to into fresh row objects (see `shipView` in `+page.svelte`) rather than
  reading `pair.$v` directly in the template.

`RawTree.svelte` keeps a local `$state.raw` mirror of one node's value for display and writes through
to `container[key]` on edit — `container`/`key` are captured once (props never change for a keyed
node; the `state_referenced_locally` autofixer warning is intentionally silenced there).

## Accessor conventions (slot.ts)

- `List<T>` → `listItems(node)` returns the backing `$0` array; `pushScalar` appends while maintaining
  `$types` metadata so it re-serializes.
- `Dictionary<K,V>` → **`dictPairs(node)`** returns the `{$k,$v}` array. Do **not** hard-code `$0`/`$1`;
  the pairs array's anonymous index shifts depending on whether the `comparer` was emitted inline or as
  a `$ref` (see save-format.md).
- Ship resources: `shipResources(entities)` (current `{$k,$v}` pairs, mutate in place) and
  `shipResourceCaps(entities)` (`Map<resourceId, max>` from the grid — see game-code.md).
- Consumables: the vault holds a **fixed run of 8 slots**, empty ones carrying a `null` id (the game's
  `Vault()` seeds 8 and `RestoreFromMemento` rebuilds one slot per memento entry). `addConsumable`
  mirrors `Vault.Add` — it fills the first empty slot rather than growing the list. `reorderConsumables`
  reorders the filled slots and keeps the empties trailing, so the slot count is preserved. The UI hides
  the empty slots and offers an add button per absent consumable type instead.

## Generated data (regenerate on game update)

These JSON files under `src/lib/save/` are extracted from the installed game and checked in:

- `asset-names.json` — id → display name/category. `python scripts/extract-asset-names.py [Punk_Data]`.
- `module-caps.json` — module GUID → capacity effects + slot level deltas. Two steps:
  `python scripts/extract-module-caps.py [Punk_Data]` then `bun scripts/extract-module-caps.ts`. The
  intermediate `scripts/module-effects-raw.json` is gitignored.
- `resource-icons.json` — resource id → data-URI PNG of its HUD icon. `python
  scripts/extract-resource-icons.py [Punk_Data]`. Rendered by `components/ResourceIcon.svelte`
  (pixelated). Extracted game art *is* committed here — see the copyright note in game-code.md.
- `item-icons.json` — ingredient/consumable/module id → data-URI PNG of its item art (long edge
  capped to 64 px). `python scripts/extract-item-icons.py [Punk_Data]`. Rendered by
  `components/ItemIcon.svelte` (pixelated).

All need the Python venv with UnityPy (see game-code.md).

## In-browser end-to-end testing

`open()` honors a dev-only hook: when `import.meta.env.DEV` and `window.__punkTestDir` is set, it loads
that in-memory `SaveDir` instead of prompting for a folder. This enables real end-to-end tests in the
dev-server page console (proxies only exist in the Svelte runtime, so a Node test can't catch the deep-
`$state` class of bug — it must run in the browser). Pattern:

1. Seed an in-memory `SaveDir` from fixtures (fetch `/test-save/<file>` after copying a real save into
   `static/test-save/`), record writes to `window.__punkTestWrites`, keep pristine copies in
   `window.__punkOrig`.
2. Drive the UI: native `HTMLInputElement` value setter + dispatched `input`/`change` events simulate
   typing. Svelte flushes async — a just-enabled button is still `disabled` in the same tick, so wait a
   tick before clicking.
3. Assert on written bytes: `import('/src/lib/save/lzf.ts')` and `/src/lib/save/odin.ts` are importable
   in the page; decode `window.__punkFiles[name]` and check values, `.bak` pristineness, and that bytes
   differ from the original.
4. Delete `static/test-save/` before committing.

A Node-side suite (`scratchpad/e2e.ts`) covers the non-proxy logic (accessors, `saveSlot`, `.bak`) on a
copy of the real save.

## Dev server note

`vite.config.ts` uses `strictPort` on 5173 (Tauri's `devUrl`) but honors `$PORT` so a second dev
server can run beside another project's (e.g. the battery-monitor app also defaults to 5173).
`.claude/launch.json` has `autoPort: true`, so `preview_start` picks a free port automatically.
