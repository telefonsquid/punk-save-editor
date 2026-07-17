---
name: punk-save-editor
description: Save-file editor for the game PUNK (SvelteKit + Tauri), built on a reverse-engineered save format. Use whenever working in D:\Repositories\punk-save-editor — editing the app, the save codec, or digging back into the game's code/assets.
---

# PUNK Save Editor

A save-file editor for the game **PUNK** (Steam app 2707980), runnable as both a website and a Tauri 2
desktop app from one SvelteKit codebase. The binary save format was reverse-engineered first; the app
is built on that codec. Repo: `D:\Repositories\punk-save-editor` (runs with **bun**).

Owner is Saskia. Ambitions beyond the current curated + raw editors: a visual **module-grid editor**,
and eventually a **map editor**.

## Read the atlas

Deep knowledge lives in versioned repo docs — read the one that matches your task instead of
rediscovering it:

- **[docs/save-format.md](../../../docs/save-format.md)** — on-disk bytes: LZF container, Odin binary
  token stream, every save file, the `world` struct dump, the `entities`/ship layout.
- **[docs/game-code.md](../../../docs/game-code.md)** — get back into the game itself: decompile
  `Punk.Main.dll` (ilspycmd), extract ScriptableObjects (UnityPy), subsystem map (resources/tanks,
  modules/grid, capacity math) with class citations.
- **[docs/editor-internals.md](../../../docs/editor-internals.md)** — how the app is wired: the
  `$state.raw` rule, slot.ts accessors, generated-data pipelines, in-browser e2e.

## Golden rules (violating these corrupts saves or crashes the game)

1. **Never wrap decoded Odin save trees in deep `$state`.** A deep proxy stores mutations in its own
   signal storage and never writes them back, so the serializer saves stale data (and aliased paths get
   independent proxies). Keep trees in `$state.raw`, mutate the raw objects directly via `oninput`
   handlers, refresh the UI with the `version` counter. This was the "edits don't persist" bug.
2. **Unit/ship resource `Value`s must stay `≥ 0`.** A negative value crashes PUNK on load (hangs the
   loading screen). Clamp all resource edits to `≥ 0`; ship resources clamp to `[0, max]`.
3. **Never commit decompiled game code or extracted assets** — copyright. Only derived facts (these
   docs) and generated lookup JSON (`asset-names.json`, `module-caps.json`) belong in the repo. Keep
   decomp/venv in the scratchpad.
4. `write(parse(x))` is byte-identical on every save file — rely on it; a round-trip regression means
   the codec broke.

## Environment (not in the repo)

| | |
| --- | --- |
| Game install | `C:\data\apps\Steam\steamapps\common\PUNK Playtest` (Unity 6000.3.4f1, Mono) |
| Game code | `…\Punk_Data\Managed\Punk.Main.dll` — decompile with `ilspycmd` |
| Assets | `…\Punk_Data\*.assets`, `level*`, `globalgamemanagers` — read with UnityPy |
| Saves | `C:\Users\alya\AppData\LocalLow\DefaultCompany\Punk\saves\save001` |
| Unity log | `C:\Users\alya\AppData\LocalLow\DefaultCompany\Punk\Player.log` (load-crash traces) |

## Commands

```bash
bun run dev      # dev server (port 5173, or $PORT; .claude/launch.json has autoPort)
bun run check    # svelte-kit sync + svelte-check — the real type gate (also .svelte files)
bun run lint     # eslint
bun run build    # adapter-static production build
```

- Always run the **Svelte MCP `svelte-autofixer`** on any component you write/edit, until clean — hard
  rule. Prefer the Svelte MCP docs tools when touching Svelte 5 features.
- **bun** is the package manager, never npm/yarn.
- Verify save-affecting changes with the in-browser e2e (`window.__punkTestDir` hook) — Node tests
  can't catch proxy-layer bugs. See docs/editor-internals.md.

## Map of the code

- `src/lib/save/` — `io.ts` (SaveDir), `lzf.ts` (codec), `odin.ts` (reader/writer), `slot.ts`
  (high-level accessors), `asset-names.json` + `module-caps.json` (generated).
- `src/routes/+page.svelte` — the editor UI (curated sections + "modify at your own risk" raw tree).
- `src/lib/components/RawTree.svelte` — recursive raw tree editor.
- `scripts/extract-asset-names.py`, `scripts/extract-module-caps.{py,ts}` — regenerate the lookup JSON
  from the installed game.
