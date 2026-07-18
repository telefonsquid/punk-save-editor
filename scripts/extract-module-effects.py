"""Step 1 of regenerating src/lib/save/module-effects.json from the installed game.

Dumps every ModuleData asset's Odin serializationData (the game stores module
effects with Odin Inspector's SerializedScriptableObject, so they are not in
the Unity typetree) plus ModuleSlotType level deltas. The binary payload is
decoded by step 2 (extract-module-effects.ts), which shares the app's Odin
reader — `bun run extract` runs both in order.

Usage:
    .venv/Scripts/python scripts/extract-module-effects.py [path-to-Punk_Data]
    bun scripts/extract-module-effects.ts
"""

import base64
import json

import punklib

OUT = punklib.REPO / "scripts/module-effects-raw.json"


def run(assets: punklib.PunkAssets) -> None:
    slot_types: dict[str, dict] = {}
    for a in assets.by_class(punklib.SLOT_TYPE_CLASSES):
        slot_types[a.id] = {
            "name": a.name,
            "canBePowered": bool(a.d.get("canBePowered")),
            "levelDelta": a.d.get("levelDelta", 0),
        }

    modules: dict[str, dict] = {}
    for a in assets.modules():
        sd = a.d.get("serializationData")
        if sd is None or a.id in modules:
            continue
        sdd = sd.__dict__
        refs = []
        for pptr in sdd.get("ReferencedUnityObjects") or []:
            entry = {"name": None, "id": None}
            try:
                target = pptr.read().__dict__
                entry["name"] = target.get("m_Name")
                tid = target.get("id")
                if isinstance(tid, str):
                    entry["id"] = tid
            except Exception as exc:  # unresolvable external ref
                entry["error"] = str(exc)
            refs.append(entry)
        modules[a.id] = {
            "name": a.name,
            "displayName": a.d.get("displayName"),
            "level": a.d.get("level"),
            "canBeBoosted": bool(a.d.get("canBeBoosted", True)),
            "bytes": base64.b64encode(bytes(sdd.get("SerializedBytes") or b"")).decode(),
            "refs": refs,
        }

    OUT.write_text(
        json.dumps({"modules": modules, "slotTypes": slot_types}, indent=1),
        encoding="utf-8",
    )
    print(f"wrote {len(modules)} modules, {len(slot_types)} slot types to {OUT}")


if __name__ == "__main__":
    run(punklib.PunkAssets(punklib.game_data_from_argv()))
