"""Regenerates src/lib/save/asset-names.json from the installed game.

id -> {category, assetName, displayName, ...} for every PUNK ScriptableObject
that carries a string id (modules, consumables, ingredients, resources, weapon
datas, slot types). The category comes from the asset's C# class via
punklib.CATEGORY_BY_CLASS — not from the asset's name, whose first word turned
out to file things like the `strange_ball` ingredient under "Strange".

Usage (or `bun run extract` for everything):
    .venv/Scripts/python scripts/extract-asset-names.py [path-to-Punk_Data]
"""

from collections import Counter

import punklib


def run(assets: punklib.PunkAssets) -> None:
    entries: dict[str, dict] = {}
    for a in assets.assets():
        entry: dict = {
            "category": a.category,
            "assetName": a.name,
            "displayName": a.d.get("displayName"),
        }
        for extra in ("description", "maxCount", "level"):
            if a.d.get(extra) not in (None, ""):
                entry[extra] = a.d[extra]
        entries[a.id] = entry
    punklib.write_json(punklib.DATA_DIR / "asset-names.json", entries)
    print(Counter(v["category"] for v in entries.values()).most_common())


if __name__ == "__main__":
    run(punklib.PunkAssets(punklib.game_data_from_argv()))
