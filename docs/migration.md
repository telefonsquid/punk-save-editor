# Game-update runbook

The game is pre-beta and updates will keep changing assets, modules and (eventually) the save
format. This is the checklist for absorbing an update quickly. The system is built so that new
things **surface loudly** instead of silently mis-filing: unknown asset classes, unknown effect
types and out-of-range enums all print warnings/errors during extraction.

## The one command

```bash
bun run extract            # default install path
bun run extract "D:/some/other/Punk_Data"
```

It runs, in order:

1. `scripts/extract-all.py` — loads the whole `Punk_Data` folder into **one** UnityPy scan
   (`scripts/punklib.py`) and runs all five extractors against it, regenerating every JSON in
   `src/lib/game/`. The Unity version is **auto-detected from the game files**, so an engine bump
   needs no edit.
2. `scripts/extract-module-effects.ts` — decodes the Odin-serialized module effects dumped in
   step 1 (`scripts/module-effects-raw.json`, gitignored).
3. `scripts/check-data.ts` — cross-checks the five generated JSONs against each other
   (also standalone: `bun run check:data`).

Then: `git diff` the generated JSON to see what the update changed, run the editor against a
current save, and commit the regenerated data.

## What each warning means

| Message | Where | What to do |
| --- | --- | --- |
| `unrecognised asset class X` | punklib scan | The update added a ScriptableObject class that carries a save id. Add it to the right set in `punklib.CATEGORY_BY_CLASS` (probe what it is first). |
| `class X … has moduleType — treating as module` | punklib | A new `ModuleData` subclass. Add it to `MODULE_CLASSES`; the fallback already filed it correctly. |
| `UNKNOWN effect types (add to EFFECT_KINDS)` | extract-module-effects.ts | A new `ModuleEffect` subclass. All eight known ones share a shape (one FloatSeries magnitude + usually a Resource + flat scalars); decompile the new class and add one row to `EFFECT_KINDS`. |
| `unnamed weapon property #N — update TARGET_PROPERTY` | check-data | The `ModifyWeaponProperty.TargetProperty` C# enum grew or was reordered. Re-check the enum in the decompiled source and fix the `TARGET_PROPERTY` array. |
| `references unknown resource` (ERROR) | check-data | An effect/weapon points at a resource the asset scan didn't find — usually means the scan itself needs attention. |
| `has no HUD icon` / `has no item icon` | check-data | Art gap in the game data; the UI falls back to text. Fine unless it's something the player sees constantly. |
| `effect field of X is WxH, must be odd-sized` (ERROR) | check-data | An effect-field sprite lost its odd dimensions, which breaks the centre cell. The game logs `"Power core has invalid size"` on the same condition, so the sprite itself is wrong — not the extractor. |
| `no bar, barCompact…` | extract-resource-icons | A resource lost one of its four art sizes. Only `icon` really matters to the editor; Money never had a large `bar`. |

## Known blast radii (what an update can break, and where the guard is)

- **Engine bump** → auto-detected; nothing to do. (`punklib._detect_unity_version`)
- **New module category** (`ModuleType` asset) → flows through automatically; the UI groups by the
  game's own categories. (`moduleCategory` in `src/lib/game/data.ts`)
- **New rich-text tag in descriptions** → unknown tags are consumed, not printed (TMP behaviour).
  Support = one entry in `TAGS` in `src/lib/game/rich-text.ts`.
- **Module sprite/tint changes** → tint is baked at extraction (Unity multiplies sprite × ColorAsset
  at runtime; we do the same in `extract-item-icons.py`). White-ColorAsset modules stay white on
  purpose; `Crawler` is authored pre-coloured and has no ColorAsset.
- **New effect-field patterns** (a `SpriteDistribution` gaining shapes) → flows through: the
  extractor writes every candidate and the chooser offers every orientation of each. A module that
  gains a `levelModificationField` becomes a booster automatically, in the diagram and in `addModule`.
- **A non-5×5 effect-field sprite** → `check-data` errors (odd-size check). If the game ever ships a
  *non-square* one it will have fixed the `y * height + x` indexing in `ModuleEffectField`; re-read
  that method before relaxing `effectFieldProblem`, which the custom-field painter depends on.
- **`ModuleData.Equippable` semantics** (displayName AND icon) → mirrored by `equippableModules()`;
  check-data counts equippables so a sudden drop is visible. `isOwnable` narrows it further and is
  *not* data-driven in the same way: it hardcodes the `Embedded` category and an "inert module"
  test that today matches only RED EYE. If the game finishes that asset, the exclusion lapses on its
  own — but a new decorative category would need adding.
- **New resource** → sorts last in every module list until it is added to `RESOURCE_ORDER` in
  `src/lib/game/data.ts` (nothing breaks; the order just stops matching the game's progression).
- **A player's painted shapes** live in `localStorage`, so they survive updates the extraction never
  sees. If `effectFieldProblem` ever gets stricter, entries that no longer pass are dropped on load
  rather than migrated — deliberate, but worth mentioning in a release note.
- **Save-format changes** → `write(parse(x))` must stay byte-identical on every save file; if the
  Odin reader throws on a new save, see docs/save-format.md before touching the codec.
- **MonoBehaviour header layout** (used by `punklib.script_class` to read `m_Script` from raw
  bytes, because the generated typetree misparses that PPtr) → stable across Unity versions for
  over a decade; if classification ever returns all-None again, check this first.

## After regenerating

1. `bun run check && bun run lint`
2. Open a real save in the editor (`bun run dev`) and eyeball the module list — categories,
   colours, descriptions, stat lines.
3. For save-affecting changes, run the in-browser e2e (docs/editor-internals.md, "In-browser
   end-to-end testing").
