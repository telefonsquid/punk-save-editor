"""Regenerates src/lib/save/asset-names.json from the installed game.

Extracts id -> displayName mappings for PUNK ScriptableObjects (modules,
consumables, ingredients, resources, ...) out of the game's .assets files.

Usage:
    python -m venv venv
    venv/Scripts/pip install UnityPy TypeTreeGeneratorAPI
    venv/Scripts/python scripts/extract-asset-names.py [path-to-Punk_Data]
"""

import json
import sys
from collections import Counter
from pathlib import Path

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

GAME_DATA = Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else r"C:/data/apps/Steam/steamapps/common/PUNK Playtest/Punk_Data"
)
OUT = Path(__file__).parent.parent / "src/lib/save/asset-names.json"
UNITY_VERSION = "6000.3.4f1"

generator = TypeTreeGenerator(UNITY_VERSION)
generator.load_local_dll_folder(str(GAME_DATA / "Managed"))

entries: dict[str, dict] = {}
scanned = 0

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
        scanned += 1
        try:
            data = obj.read(check_read=False)
        except Exception:
            continue
        d = data.__dict__
        ident = d.get("id")
        if not ident or not isinstance(ident, str):
            continue
        asset_name = d.get("m_Name") or ""
        entry = {
            # first word of the asset name is a reliable category label
            "category": asset_name.split(" ")[0] if asset_name else "Unknown",
            "assetName": asset_name,
            "displayName": d.get("displayName"),
        }
        for extra in ("description", "maxCount", "level"):
            if d.get(extra) not in (None, ""):
                entry[extra] = d[extra]
        entries[ident] = entry

entries = dict(sorted(entries.items()))
OUT.write_text(json.dumps(entries, indent=1), encoding="utf-8")
print(f"scanned {scanned} MonoBehaviours, wrote {len(entries)} entries to {OUT}")
print(Counter(v["category"] for v in entries.values()).most_common(10))
