"""Step 1 of regenerating src/lib/save/module-caps.json from the installed game.

Dumps every ModuleData asset's Odin serializationData (the game stores module
effects with Odin Inspector's SerializedScriptableObject, so they are not in
the Unity typetree) plus ModuleSlotType level deltas. The binary payload is
decoded by step 2, which shares the app's Odin reader:

    python -m venv venv
    venv/Scripts/pip install UnityPy TypeTreeGeneratorAPI
    venv/Scripts/python scripts/extract-module-caps.py [path-to-Punk_Data]
    bun scripts/extract-module-caps.ts
"""

import base64
import json
import sys
from pathlib import Path

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

GAME_DATA = Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else r"C:/data/apps/Steam/steamapps/common/PUNK Playtest/Punk_Data"
)
OUT = Path(__file__).parent / "module-effects-raw.json"
UNITY_VERSION = "6000.3.4f1"

generator = TypeTreeGenerator(UNITY_VERSION)
generator.load_local_dll_folder(str(GAME_DATA / "Managed"))

modules = {}
slot_types = {}

candidates = (
    sorted(GAME_DATA.glob("*.assets"))
    + sorted(GAME_DATA.glob("level*"))
    + [GAME_DATA / "globalgamemanagers"]
)
for assets_file in candidates:
    if not assets_file.is_file() or assets_file.suffix == ".resS":
        continue
    env = UnityPy.load(str(assets_file))
    env.typetree_generator = generator
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            data = obj.read(check_read=False)
        except Exception:
            continue
        d = data.__dict__
        ident = d.get("id")
        if not isinstance(ident, str) or not ident:
            continue
        if "canBePowered" in d and "gridPlacementRectSize" in d:
            slot_types[ident] = {
                "name": d.get("m_Name"),
                "canBePowered": bool(d.get("canBePowered")),
                "levelDelta": d.get("levelDelta", 0),
            }
            continue
        if "moduleType" not in d or ident in modules:
            continue
        sd = d.get("serializationData")
        if sd is None:
            continue
        sdd = sd.__dict__
        refs = []
        for pptr in sdd.get("ReferencedUnityObjects") or []:
            entry = {"name": None, "id": None}
            try:
                target = pptr.read()
                td = target.__dict__
                entry["name"] = td.get("m_Name")
                tid = td.get("id")
                if isinstance(tid, str):
                    entry["id"] = tid
            except Exception as exc:  # unresolvable external ref
                entry["error"] = str(exc)
            refs.append(entry)
        modules[ident] = {
            "name": d.get("m_Name"),
            "displayName": d.get("displayName"),
            "level": d.get("level"),
            "canBeBoosted": bool(d.get("canBeBoosted", True)),
            "bytes": base64.b64encode(bytes(sdd.get("SerializedBytes") or b"")).decode(),
            "refs": refs,
        }

OUT.write_text(
    json.dumps({"modules": modules, "slotTypes": slot_types}, indent=1),
    encoding="utf-8",
)
print(f"wrote {len(modules)} modules, {len(slot_types)} slot types to {OUT}")
