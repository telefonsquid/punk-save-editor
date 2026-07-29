# PUNK save editor — reference atlas

Reverse-engineering notes and architecture for this editor. Start with the
[`punk-save-editor` skill](../.claude/skills/punk-save-editor/SKILL.md) for orientation, then dive in:

| Doc | What's in it |
| --- | --- |
| [save-format.md](save-format.md) | The on-disk format: LZF container, Odin binary token stream, every file in a save slot, the `world` struct dump, and the `entities`/ship layout. |
| [game-code.md](game-code.md) | How to get back into the game itself: decompiling `Punk.Main.dll` (ilspycmd), extracting ScriptableObject data (UnityPy), and a subsystem map (resources/tanks, modules/grid, capacity math) with class citations. |
| [editor-internals.md](editor-internals.md) | How the SvelteKit app is wired: the `$state.raw` save-tree rule that saves depend on, the save/game/editor layer split, generated-data pipelines, and in-browser e2e testing. |
| [migration.md](migration.md) | The game-update runbook: `bun run extract`, what every warning means, and the known blast radii of an update. |
| [design.md](design.md) | The design system: the three game fonts and their pixel grids, the palette tokens, the game pixel `--u`, integer-scaled art, the shared `punk-*` utilities, the borrowed interface sounds, and the `.crt-screen` scroller traps. |

**Golden rules** (each explained in the docs):

- Never wrap the decoded Odin save trees in deep `$state` — mutations wouldn't reach the serializer.
- Ship/unit resource `Value`s must stay `≥ 0` — a negative crashes the game on load.
- Don't commit decompiled game code (extracted assets and lookup JSON *are* committed — policy since 2026-07-17).
