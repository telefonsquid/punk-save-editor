"""Regenerates src/lib/save/module-info.json from the installed game.

Things the editor needs about a module that aren't in the save file:

1. **Colour / resource.** Every `ModuleData` points at a `ColorAsset`, and so
   does every `Resource`. Modules share the *same* ColorAsset object as the
   resource they belong to (a tech/Caps weapon and `Resource Caps` both point at
   the orange one), so matching on the ColorAsset's path_id recovers which
   resource a module maps to — which is what gives modules their colour in the
   game's own UI.
2. **Defaults for a module the editor adds to the vault.** `Module.Memento`
   stores a `powerLevel` and a `powerCore` field grid, neither of which can be
   invented: the power level comes from the asset's `MinMaxInt powerLevel` and
   the power core is a *sprite* the game converts to a bool grid
   (`ModuleEffectField.Parse`: alpha > 0.5 per pixel).
3. **Category, description and weapon stats.** `ModuleData.moduleType` points at
   a `ModuleType` asset whose `displayName` is the shop category ("Weapon",
   "Gadget", ...) and whose `orderInShop` is the order the game lists them in.
   `description` is TMP rich text and keeps its `<color=#rrggbb>` tags — the UI
   renders them, so they must survive extraction verbatim. A `WeaponModuleData`
   additionally points at a `WeaponData` carrying the numbers the game shows on
   a weapon card (damage, fire rate, and the per-shot resource cost).

`ModuleEffectField.Parse` also applies a random mirror/rotation when the game
draws a core, so there is no single canonical orientation; this writes the base
orientation, which is one of the orientations the game itself could have drawn.
In practice every core in the game is symmetric, so it makes no difference.

Usage (or `bun run extract` for everything):
    .venv/Scripts/python scripts/extract-module-info.py [path-to-Punk_Data]
"""

import punklib


def power_core(distribution) -> dict | None:
    """First item of a SpriteDistribution as a bool grid, base orientation.

    Mirrors ModuleEffectField.Parse: a pixel with alpha > 0.5 is a filled cell.
    Unity's GetPixels is bottom-up while PIL is top-down, so the rows are
    flipped to match the indexing the game writes into the save.
    """
    items = getattr(distribution, "items", None)
    if not items:
        return None
    try:
        sprite = items[0].value.read()
        img = sprite.image.convert("RGBA")
    except Exception:
        return None
    w, h = img.size
    px = img.load()
    data = []
    for y in range(h):
        for x in range(w):
            data.append(1 if px[x, h - 1 - y][3] > 127 else 0)
    return {"width": w, "height": h, "data": data}


def module_type(pptr) -> dict | None:
    """The shop category a module belongs to."""
    d = punklib.read_fields(pptr)
    if d is None:
        return None
    name = d.get("displayName") or d.get("m_Name")
    if not name:
        return None
    return {"name": name, "order": d.get("orderInShop", 0), "isMain": bool(d.get("isMain"))}


def num(value) -> float | None:
    """Drops zero/None so the JSON only carries stats the module actually has."""
    if value is None:
        return None
    value = round(float(value), 4)
    return value if value else None


def weapon_stats(pptr) -> dict | None:
    """The weapon-card numbers for a WeaponModuleData's WeaponData."""
    d = punklib.read_fields(pptr)
    if d is None:
        return None
    damage = d.get("damage")
    stats = {
        "damage": num(getattr(damage, "amount", None)),
        "damageType": punklib.resource_id(getattr(damage, "damageType", None)),
        "fireRate": num(d.get("fireRate")),
        "cost": num(d.get("cost")),
        "costResource": punklib.resource_id(d.get("resourceUsed")),
        "burstSize": num(d.get("burstSize")),
        "projectileCount": num(d.get("projectileCount")),
        "spread": num(d.get("spread")),
        "knockback": num(d.get("knockbackForce")),
    }
    stats = {k: v for k, v in stats.items() if v is not None}
    # burstSize defaults to 1 and projectileCount to 1; neither says anything.
    for key in ("burstSize", "projectileCount"):
        if stats.get(key) == 1:
            del stats[key]
    return stats or None


def run(assets: punklib.PunkAssets) -> None:
    # Each Resource claims its ColorAsset so modules sharing it can be matched.
    color_to_resource: dict[int, str] = {}
    for a in assets.by_class({"Resource"}):
        pid = punklib.path_id(a.d.get("color"))
        if pid:
            color_to_resource[pid] = a.id

    modules: dict[str, dict] = {}
    for a in assets.modules():
        level = a.d.get("powerLevel")
        modules[a.id] = {
            "color": punklib.hex_color(a.d.get("color")),
            "type": module_type(a.d.get("moduleType")),
            "description": a.d.get("description") or None,
            "powerLevel": [getattr(level, "Min", 1) or 1, getattr(level, "Max", 1) or 1],
            "powerCore": power_core(a.d.get("powerCore")),
            "weapon": weapon_stats(a.d.get("weapon")),
            "resource": color_to_resource.get(punklib.path_id(a.d.get("color")) or 0),
        }

    punklib.write_json(punklib.DATA_DIR / "module-info.json", modules)
    matched = sum(1 for m in modules.values() if m["resource"])
    print(f"  {matched} mapped to a resource, {len(modules) - matched} unmapped")
    print(f"  {sum(1 for m in modules.values() if m['powerCore'])} with a power core")
    print(f"  {sum(1 for m in modules.values() if m['weapon'])} with weapon stats")
    kinds = sorted({m["type"]["name"] for m in modules.values() if m["type"]})
    print(f"  categories: {', '.join(kinds)}")


if __name__ == "__main__":
    run(punklib.PunkAssets(punklib.game_data_from_argv()))
