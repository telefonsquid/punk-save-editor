# PUNK Save Editor

A save file editor for [PUNK](https://store.steampowered.com/app/2707980/PUNK/), built with SvelteKit + Tauri. Runs as a website (Chromium-based browsers) and as a standalone desktop app from the same codebase.

Currently editable: shared resources (money), run stats, vault ingredients, consumables, and module power levels. Originals are backed up as `*.bak` on first save.

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

## Regenerating asset names

`src/lib/save/asset-names.json` maps the GUIDs in save files to display names. After a game update, regenerate it from the installed game:

```sh
python -m venv venv
venv/Scripts/pip install UnityPy TypeTreeGeneratorAPI
venv/Scripts/python scripts/extract-asset-names.py "<path-to>/PUNK Playtest/Punk_Data"
```
