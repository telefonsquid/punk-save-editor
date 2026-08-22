"""Regenerates src/lib/game/slot-types.json from the installed game.

What a grid cell's slot type *does*, which the save file doesn't say (it only
stores the type's id per cell):

1. **`canBePowered`** — whether a power core's field can power the cell.
   `Invalid` is the one type where it is false.
2. **`compatibleModuleTypes`** — which module categories may sit on the cell
   (`ModuleSlotType.IsCompatible`). This is how weapon slots reject passives,
   and why a spare weapon cannot be parked on a normal cell: `Normal` lists
   only the four augmentation categories.
3. **`levelDelta`** — the level bonus a `LevelChangerSlotType` grants to the
   module on it (`LevelUp`, the booster cell). Absent on regular types.
4. **`gridPlacementRectSize` / `countInPlacementRect`** — the parameters
   `ModuleGrid.RandomizeSlots` rolls the special cells with, which the grid
   editor's reroll needs. Zero on the types that are never generated.

Module types are recorded under the same identity `module-info.json` uses for
a module's `type.name` (punklib.module_type_name), so a compatibility check in
the app is one string comparison.

Usage (or `bun run extract` for everything):
    .venv/Scripts/python scripts/extract-slot-types.py [path-to-Punk_Data]
"""

import punklib


def run(assets: punklib.PunkAssets) -> None:
    slots: dict[str, dict] = {}
    for a in assets.by_class(punklib.SLOT_TYPE_CLASSES):
        entry = {
            "canBePowered": bool(a.d.get("canBePowered")),
            "compatibleModuleTypes": [
                name
                for name in (
                    punklib.module_type_name(p) for p in a.d.get("compatibleModuleTypes") or []
                )
                if name
            ],
            "gridPlacementRectSize": int(a.d.get("gridPlacementRectSize") or 0),
            "countInPlacementRect": int(a.d.get("countInPlacementRect") or 0),
        }
        if a.cls == "LevelChangerSlotType":
            entry["levelDelta"] = int(a.d.get("levelDelta") or 0)
        slots[a.id] = entry

    punklib.write_json(punklib.DATA_DIR / "slot-types.json", slots)
    generated = sorted(i for i, s in slots.items() if s["countInPlacementRect"])
    print(f"  randomly generated: {', '.join(generated) or 'none'}")
