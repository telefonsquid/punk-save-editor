"""Regenerates src/lib/game/resource-icons.json from the installed game.

A `Resource` carries *four* pieces of art, not one, and the game uses each in a
different place — so they are grouped under the resource id instead of the old
one-icon-per-id map:

| key         | field                        | where the game uses it |
| ----------- | ---------------------------- | ---------------------- |
| `icon`      | `Sprite icon`                | the HUD glyph / label icon (8-13 px) |
| `bar`       | `resourceBarTexture`         | one full-size unit of the HUD bar; the only *large* art that differs per resource |
| `barCompact`| `resourceBarTextureCompact`  | the compact bar unit |
| `barMicro`  | `resourceBarTextureMicro`    | the micro bar unit |

The compact and micro textures are *shared* by every resource (the same grey
sprite) — the game tells them apart by tinting with the resource's colour, which
is why `color` is written alongside. `Resource Money` has no large bar at all
(money isn't a tank), so `bar` is simply absent for it; the app falls back.

For the ship-resource redesign the editor also mimics the HUD tank bar itself: a
row of unit shapes, full ones bright, the rest a dim outline. Those two shapes
are NOT resource fields — they live on the `resourceBarUnitPrefab`, whose
`ResourceUnit` script carries three white-alpha sprites (`fullSprite`,
`emptySprite`, `highlightSprite`). The game tints each with a matching colour:

| json key         | source                                    |
| ---------------- | ----------------------------------------- |
| `barFull`        | prefab `fullSprite` — the solid unit      |
| `barEmpty`       | prefab `emptySprite` — the hollow outline |
| `barColorFull`   | `resourceBarUnitColorFull`                |
| `barColorEmpty`  | `resourceBarUnitColorEmpty`               |
| `barColorHi`     | `resourceBarUnitColorHighlight` (hover)   |

Highlight reuses the `barFull` shape tinted `barColorHi`, so no separate sprite
is ripped. `maxUnitPerRowInHud` is how many units the game packs before wrapping
to a second row.

`orderInHud` is the order the game lists resources in, and is what the editor
sorts resource rows by.

Usage (or `bun run extract` for everything):
    .venv/Scripts/python scripts/extract-resource-icons.py [path-to-Punk_Data]
"""

import punklib

# json key -> the Resource field it comes from.
ART = {
    "icon": "icon",
    "bar": "resourceBarTexture",
    "barCompact": "resourceBarTextureCompact",
    "barMicro": "resourceBarTextureMicro",
}

# json key -> the ResourceUnit prefab field the tank-bar shape comes from.
UNIT_SPRITES = {
    "barFull": "fullSprite",
    "barEmpty": "emptySprite",
}

# json key -> the inline Color field on the Resource used to tint each shape.
UNIT_COLORS = {
    "barColorFull": "resourceBarUnitColorFull",
    "barColorEmpty": "resourceBarUnitColorEmpty",
    "barColorHi": "resourceBarUnitColorHighlight",
}


def art_uri(pptr) -> str | None:
    """A Sprite/Texture2D pointer as a native-size PNG data URI, or None."""
    if pptr is None or not punklib.path_id(pptr):
        return None
    try:
        return punklib.png_data_uri(pptr.read().image)
    except Exception:
        return None


def sprite_uri(sr_pptr) -> str | None:
    """A SpriteRenderer pointer's sprite as a native-size PNG data URI, or None."""
    if sr_pptr is None:
        return None
    try:
        sprite = sr_pptr.read().__dict__.get("m_Sprite")
        return art_uri(sprite)
    except Exception:
        return None


def inline_hex(color) -> str | None:
    """An inline UnityEngine.Color as #rrggbb — the tank colours are opaque and
    the sprite carries its own alpha, so dropping alpha loses nothing."""
    return punklib.rgb_hex(punklib.unity_color_rgb(color))


def run(assets: punklib.PunkAssets) -> None:
    resources: dict[str, dict] = {}
    for a in assets.by_class({"Resource"}):
        entry: dict = {
            "color": punklib.hex_color(a.d.get("color")),
            "orderInHud": a.d.get("orderInHud", 0),
            "maxUnitPerRow": a.d.get("maxUnitPerRowInHud", 0),
        }
        for key, field in ART.items():
            uri = art_uri(a.d.get(field))
            if uri:
                entry[key] = uri
        # The bright/hollow unit shapes hang off the prefab, not the Resource.
        prefab = a.d.get("resourceBarUnitPrefab")
        fields = prefab.read().__dict__ if prefab and punklib.path_id(prefab) else {}
        for key, field in UNIT_SPRITES.items():
            uri = sprite_uri(fields.get(field))
            if uri:
                entry[key] = uri
        for key, field in UNIT_COLORS.items():
            hexed = inline_hex(a.d.get(field))
            if hexed:
                entry[key] = hexed
        missing = [k for k in ART if k not in entry]
        if missing:
            print(f"  {a.id}: no {', '.join(missing)}")
        resources[a.id] = entry
    punklib.write_json(punklib.DATA_DIR / "resource-icons.json", resources)
    for key in {**ART, **UNIT_SPRITES}:
        print(f"  {sum(1 for r in resources.values() if key in r)} with {key}")


if __name__ == "__main__":
    run(punklib.PunkAssets(punklib.game_data_from_argv()))
