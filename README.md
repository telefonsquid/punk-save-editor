# PUNK Save Editor

A save file editor for [PUNK](https://store.steampowered.com/app/2707980/PUNK/), built with SvelteKit + Tauri. Runs as a website (Chromium-based browsers) and as a standalone desktop app from the same codebase.

Currently editable: ship resources (bounded by the grid-derived maximums), shared resources, run stats, vault ingredients, consumables, and vault modules (add/remove, connections, power cores) — plus a raw tree editor for everything else. Originals are backed up as `*.bak` on first save.

The save format (LZF compression + Odin Serializer binary) is documented in [docs/save-format.md](docs/save-format.md); the codec lives in `src/lib/save/`.

## Development

```sh
bun install
bun run dev          # website at http://localhost:5173
bun run tauri dev    # desktop app
```

## Building

```sh
bun run build        # static site into build/
bun run tauri build  # desktop installers
```

## Regenerating game data

The JSON under `src/lib/game/` (asset names, module info/effects, icons) is extracted from the installed game. After a game update:

```sh
python -m venv .venv
.venv/Scripts/pip install UnityPy TypeTreeGeneratorAPI Pillow
bun run extract      # or: bun run extract "<path-to>/PUNK Playtest/Punk_Data"
```

See [docs/migration.md](docs/migration.md) for the full runbook.
