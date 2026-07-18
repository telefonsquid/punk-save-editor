# Accessing PUNK's game code & assets

Everything the editor knows about PUNK was reverse-engineered from the shipped game — there is no
source or modding API. This is the field guide for getting back into the game's code and data when
you need a fact the save files alone don't reveal (what a field means, how a value is computed, what
an id refers to).

> **Copyright:** this is all the game's intellectual property. The **decompiled C#** stays in the
> scratchpad — never commit it. **Extracted assets** (resource icons, sprites, and the like) *may* be
> committed as generated data produced by a checked-in script (see below), alongside the derived
> lookup tables (field names, formats, id→name maps).

## Where the game is

| Thing | Path |
| ----- | ---- |
| Game install | `C:\data\apps\Steam\steamapps\common\PUNK Playtest` (Steam app **2707980**) |
| Managed assembly | `…\PUNK Playtest\Punk_Data\Managed\Punk.Main.dll` (the game's own code) |
| Asset files | `…\PUNK Playtest\Punk_Data\*.assets`, `level*`, `globalgamemanagers` |
| Engine | Unity **6000.3.4f1**, **Mono** backend (so the DLL is real IL, fully decompilable) |
| Saves | `C:\Users\alya\AppData\LocalLow\DefaultCompany\Punk\saves\save001` (`coop_save001` for co-op) |
| Unity log | `C:\Users\alya\AppData\LocalLow\DefaultCompany\Punk\Player.log` (load-crash stack traces show here) |

The game version can change between playtest builds — if a save or asset stops parsing, re-check the
Unity version (Mono, so `…\Managed\` DLL dates give a hint) and regenerate the derived data below.

## 1. Decompiling the C# (`ilspycmd`)

`ilspycmd` is installed as a global dotnet tool (`~/.dotnet/tools/ilspycmd`, v8.2.x for .NET 8).

```bash
# whole assembly into a browsable flat tree of .cs files (766 files, ~3.3 MB)
ilspycmd "C:/data/apps/Steam/steamapps/common/PUNK Playtest/Punk_Data/Managed/Punk.Main.dll" \
  -o <scratchpad>/decomp/full
```

This produces one `.cs` per type plus a `Punk.Main.csproj`. Then just `grep`/read within
`decomp/full/`. Useful entry points seen so far:

- **Save/load:** `Punk.SaveLoad.GameSaver`, `SaveFolder`, `LevelSnapshot`, `CLZF2` (the LZF codec).
- **Ship & combat units:** `Unit` (+ nested `Unit.Data`, `Unit.Data.Memento`), `ResourceTank`, `Resource`.
- **Modules/grid:** `ModuleGrid`, `ModuleCluster`, `Module` (+ `Module.Memento`), `ModuleData`,
  `ModuleSlotType`/`LevelChangerSlotType`, `ModuleEffectField`, and the `ModuleEffect` subclasses
  (`ModifyResourceCapacity`, `ResourceAutoChargeEffect`, `DrainResourceEffect`, `AddShieldEffect`, …).
- **Run/vault:** `RunData`, `Vault` (both with nested `Memento` types).

Tip: the classes that end up in save files implement `IMemento` / `IMementoOriginator<T>` and have a
nested `Memento` class — that nested class *is* the on-disk shape. `CreateMemento()` shows what gets
written, `RestoreFromMemento()` shows how it's read back (and what a bad value will do — that's how
the negative-resource load crash was diagnosed).

## 2. Extracting asset data (UnityPy)

The DLL has the *code*, but designer-authored values (module effect magnitudes, display names,
resource metadata) live in Unity `ScriptableObject` assets. Read them with **UnityPy** +
**TypeTreeGeneratorAPI** (the Mono DLLs give UnityPy the type trees it needs).

Python venv (kept in scratchpad; recreate anywhere):

```bash
python -m venv venv
venv/Scripts/pip install UnityPy TypeTreeGeneratorAPI
```

Boilerplate that every extraction script uses:

```python
import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
gen = TypeTreeGenerator("6000.3.4f1")
gen.load_local_dll_folder(str(GAME_DATA / "Managed"))
for f in sorted(GAME_DATA.glob("*.assets")) + sorted(GAME_DATA.glob("level*")) + [GAME_DATA/"globalgamemanagers"]:
    if not f.is_file() or f.suffix == ".resS": continue
    env = UnityPy.load(str(f)); env.typetree_generator = gen
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour": continue
        data = obj.read(check_read=False)          # may throw; wrap in try/except
        d = data.__dict__                          # field name -> value
```

Identifying an asset by its fields (there's no clean type filter): a `ScriptableObject` with a string
`id` field is one of the game's identifiable assets. Discriminate by which fields it has —
`moduleType` → `ModuleData`; `isShared`+`lowTreshold` → `Resource`; `canBePowered`+`gridPlacementRectSize`
→ `ModuleSlotType`; `displayName` present → user-facing.

### Gotcha: Odin-serialized assets

`ModuleData` derives from Odin's `SerializedScriptableObject`, so its `effects` list is **not** in the
Unity type tree — it's an Odin binary blob in `serializationData.SerializedBytes`, with Unity object
references pulled out into `serializationData.ReferencedUnityObjects` (a `PPtr` list). To read those:

1. In Python, base64 the `SerializedBytes` and resolve each `ReferencedUnityObjects` entry to its
   `m_Name`/`id` (see `scripts/extract-module-caps.py`).
2. In TS, decode the bytes with **`OdinBinaryReader.parseMembers`** (not `parse` — asset streams are a
   bare member sequence). External references decode to `{$ext: index}`; look the index up in the
   dumped `refs` array to get the real object id (see `scripts/extract-module-caps.ts`).

This is exactly the two-step pipeline that produces `src/lib/save/module-caps.json`.

## 3. Subsystem map (runtime → save)

### Resources & tanks

- A `Resource` is a `ScriptableObject` with `Id` (e.g. `"Resource Fuel"`), `isShared`, `lowTreshold`,
  colors, sprite tags. `isShared` currencies (only `Resource Money`) live per-run in `rundata`; all
  others are per-unit.
- A `Unit` owns a `Dictionary<Resource, ResourceTank>`. `ResourceTank` has `Capacity` (max) and
  `Value` (current), both `float`, plus `isInfinite`.
- **Only `Value` is saved.** `Unit.Data.CreateMemento()` writes `resourceValues =
  GetNotSharedTanks().ToDictionary(id, tank.Value)`. Capacity is **never** persisted.
- On load, `RestoreFromMemento()` iterates `resourceValues`; if the unit has no tank for a resource
  yet it calls `InstallNewTank(resource, value)` — which sets **both** `Capacity` and `Value` to that
  number — then sets `Value`. The *real* capacities are re-established afterwards by
  `RecalculateStats()` running the installed modules' effects. So a freshly loaded ship's caps come
  entirely from its grid, which is why the editor recomputes them (below) instead of reading them.
- **Negative or NaN `Value` = load crash.** `InstallNewTank` with a negative capacity makes the HUD's
  `ResourceBarRow` index `segmentStates[-1]`; the exception escapes `GameController.OnLevelGenerated`
  (`async void`) so `LevelGenerated` never fires and the loading screen hangs. Clamp edits to `≥ 0`.

### Modules, grid & capacity computation

The ship's `ModuleGridOwner` holds a `ModuleGrid`; its memento is two dictionaries keyed by absolute
`Vector2Int` grid cell (ship grid centered at `(50,50)`):

- `slotTypes: Dictionary<Vector2Int, string>` — slot-type id per cell (`"Normal"`, `"Weapon"`,
  `"Embedded"`, `"Active"`, `"LevelUp"`, …).
- `modules: Dictionary<Vector2Int, Module.Memento>` — installed modules.

Each `Module.Memento`: `moduleDataId` (GUID → a `ModuleData` asset), connection bools, `powerCore` and
`levelModificationField` (`ModuleEffectField` = a bool grid + `width`/`height`), and `powerLevel: int`.

**A module's effective level** = its `ModuleData.level` (base), **plus** deltas from:
1. `LevelChangerSlotType.levelDelta` for the slot it sits on (the `LevelUp` slot type = +1), and
2. neighbor `levelModificationField`s — each module's field, positioned relative to the module cell,
   grants +1 to every covered cell (`ModuleEffectField.GetPositionsRelative`, indexing
   `fieldData[y*height + x]`, offset by `-width/2, -height/2`).

Only modules with `canBeBoosted` receive the deltas.

**A resource's max capacity** = sum over installed modules of each `ModifyResourceCapacity` effect
evaluated at the module's effective level. The effect carries a `FloatSeries delta` (`baseValue`,
`increaseMethod` ∈ {Add, Multiply}, `change`); the value at level *L* is
`Add: baseValue + change*(L-1)` or `Multiply: baseValue * change^(L-1)` (`FloatSeries.GetElement`,
index = level-1). `slot.ts:shipResourceCaps` mirrors this.

Caveats the editor accepts: power/connectivity is **not** simulated (the game only counts *powered,
connected* modules via `ModuleCluster`), so an unpowered module parked on the grid still contributes —
the computed cap is an **upper bound**, exact for valid layouts. Reproducing power routing would mean
porting `ModuleCluster.RefreshPoweredSlots` / `ModuleGrid.OnModulesChanged` — the plan if grid editing
ever needs exactness.

### Resource regeneration

Recharge works through the **same grid + effective-level machinery as capacity**, just a different
effect: `ResourceAutoChargeEffect { Resource resource; FloatSeries rechargeRate }` calls
`unit.IncreaseRechargeRate(resource, rechargeRate.GetElement(Module.Level - 1))` from
`OnRecalculateUnitStats`. So a **booster next to a regen module raises its rate** by raising its
effective level — nothing regen-specific about it. `slot.ts:shipResourceRegen` shares the grid walk
with `shipResourceCaps` (`sumGridEffects`).

23 `ModuleData` assets carry a recharge effect. The named player-facing ones are `CAPS/HEALTH/GEL/
TECH/STAMINA REGEN` and `POWER CORE`; the rest are unnamed `Module Embedded *` enemy parts.

**Stamina's "base" regen is not a base value** — there is no intrinsic per-resource rate anywhere
(`Resource` only has `rechargeDelay`, and `IncreaseRechargeRate` has exactly one caller). It comes
from the always-installed **`SHIP` module**, which carries a flat `Resource White +20/s` and is the
one module with `canBeBoosted = false`. Because it sits on the grid, the ordinary walk picks it up.

`ResourceRecharger.Update` then gates charging: it only ticks once
`Time.time > lastDecreaseTime + resource.rechargeDelay` and the tank isn't full. The editor reports
the steady-state rate, not what you'd observe right after taking damage.

### The other module effects

`ModifyResourceCapacity` and `ResourceAutoChargeEffect` are two of eight `ModuleEffect` subclasses,
and all eight share one shape: a `FloatSeries` magnitude evaluated at level-1, usually a `Resource`
reference, and a few flat scalars. Only the field *names* differ, which is why
`scripts/extract-module-caps.ts` decodes them from a single table rather than case by case:

| C# type | kind | magnitude field | notes |
| --- | --- | --- | --- |
| `ModifyResourceCapacity` | `capacity` | `delta` | 109 effects |
| `ResourceAutoChargeEffect` | `regen` | `rechargeRate` | 27 |
| `ModifyWeaponProperty` | `weaponProperty` | `value` | 8; `targetProperty` enum (fire rate, spread, damage, …) and `operation` ∈ {Add, Multiply} |
| `AddShieldEffect` | `shield` | `effectiveness` | 6; absorbs damage against a resource |
| `DrainResourceEffect` | `drain` | `drainRate` | 5; enemy parts |
| `AddExplosionEffect` | `explosion` | `damageAmount` | 4; also a `burn` series and an explosion radius |
| `AddBurnEffect` | `burn` | `amount` | 1 |
| `AddDischargeEffect` | `discharge` | `damageIncrement` | 1; chain lightning |

The last three, plus `AddExplosionEffect`, are weapon augments and charge a `costPerProjectile` in a
`costResource` on top of their effect — that is the "cost per shot" the editor prints.

### Weapon stats

A weapon module is a `WeaponModuleData` (a `ModuleData` subclass) pointing at a `WeaponData`. That
asset is a plain Unity typetree object, so `extract-module-info.py` reads it directly: `damage`
(a `Damage` struct = amount + a `Resource` damage type), `fireRate`, `cost` + `resourceUsed`
(`IHasCost` — the per-shot price the ship pays), `burstSize`, `projectileCount`, `spread`,
`knockbackForce`. 60 of the 145 modules have one.

`ModuleType` is a tiny ScriptableObject (`displayName`, `orderInShop`, `isMain`) and is the game's
own shop grouping: WEAPONS, GADGETS, UPGRADES, WEAPON MODS, POWER, BOOSTERS, Embedded. Weapons and
gadgets are the categories that carry a `powerCore` sprite; upgrades and weapon mods have none and a
`powerLevel` of `[1,1]`.

### Rich text in descriptions

`ModuleData.description` is TextMesh Pro markup. In the current build only `<color=#rrggbb>` occurs,
and the colours are the resource colours — `<color=#4D79FF>FUEL</color>` is Fuel's blue. See the
rich-text section in editor-internals.md for how the editor renders it.

### Ids → human names

Module/consumable/ingredient/resource ids in saves are Unity asset ids (GUIDs or `"Resource X"`
strings). `scripts/extract-asset-names.py` dumps every identifiable asset's `id → {category,
assetName, displayName, …}` into `src/lib/save/asset-names.json`, surfaced through
`slot.ts:displayName()`. Regenerate it (and `module-caps.json`) whenever the game updates.

`Resource` assets have **no `displayName`**, and three of their ids are artist codenames rather than
player-facing words. `slot.ts:RESOURCE_LABELS` maps `Resource Money → Money`,
`Resource White → Stamina`, `Resource Purple → Gel`; everything else just loses the `Resource `
prefix. The ids remain the save-file keys.

### Resource icons

Each `Resource` ScriptableObject has a `Sprite icon` (the little HUD glyph for health/fuel/etc.).
`scripts/extract-resource-icons.py` loads the whole `Punk_Data` folder into one UnityPy environment
(so the cross-file sprite `PPtr` resolves), reads each icon to a PIL image via `sprite.image`, and
writes an `id → data-URI PNG` map to `src/lib/save/resource-icons.json`. They're tiny pixel-art (~8–13
px), so inlining them as base64 keeps the editor self-contained (the `ResourceIcon.svelte` component
renders them with `image-rendering: pixelated`). Regenerate on game update.

### Module colours → resources

Every `ModuleData` has a `ColorAsset color`, and so does every `Resource` — and a module points at the
**same ColorAsset object** as the resource it belongs to. So matching on the ColorAsset's `path_id`
recovers which resource a module maps to, which is exactly what tints it in the game's own UI (a
`DANDELION` is `#6a36ff` because it is a `Resource Tech` module). 144 of 145 modules map this way; the
odd one out (`BOOSTER CORE`, green) has a ColorAsset no resource claims. Most modules map to
`Resource White` (`#ffffff`), the neutral colour.

`scripts/extract-module-info.py` writes this plus two things needed to *build* a module from scratch,
to `src/lib/save/module-info.json`:

- `powerLevel: [min, max]` from the asset's `MinMaxInt`. This is the **maximum number of power cores
  the module can accept** when expanding its grid (`HoveredModuleInfo` renders it as
  `ATTACHED POWER CORES: {connected} / {PowerLevel}`), so a *higher* value is better for the player.
- `powerCore` — the bool grid the game derives from the module's power-core **sprite**.
  `ModuleEffectField.Parse` reads `alpha > 0.5` per pixel and applies a *random* mirror/rotation each
  time a core is drawn, so there is no canonical orientation; the script stores the base orientation,
  which is one the game itself could have drawn. Every core in the game is symmetric, so it makes no
  practical difference — the extracted 5×5 grid is byte-identical to the ones in a real save.

### Item icons

Ingredients, consumables and modules carry their own item art: `Ingredient.iconBig`/`iconSmall`,
`Consumable.icon`, `ModuleData.icon` (all normal Unity `Sprite` fields, so they're in the type tree
even for the Odin-serialized `ModuleData`). `scripts/extract-item-icons.py` loads the whole folder
into one env (cross-file sprite PPtrs again), discriminates the three asset kinds by their fields
(`moduleType` → module, `maxCount`+`icon` → consumable, `iconBig`/`iconSmall` → ingredient), and
writes an `id → data-URI PNG` map to `src/lib/save/item-icons.json`. This art is larger than the HUD
glyphs, so each sprite's long edge is capped to 64 px (nearest-neighbour) to keep the JSON checkin-
sized. Rendered by `components/ItemIcon.svelte` (pixelated); assets with no sprite assigned (a few
modules, e.g. `Weapon_Fly`) are simply absent from the map. Regenerate on game update.
