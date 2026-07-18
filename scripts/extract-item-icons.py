"""Regenerates src/lib/save/item-icons.json from the installed game.

Ingredients, consumables and modules each carry a Sprite icon (the item art
shown in the vault/shop): `Ingredient.iconBig`/`iconSmall`, `Consumable.icon`,
`ModuleData.icon`. This resolves each to a PNG and writes an id -> data-URI map
the editor imports so it can show the real item picture next to every entry.

Sprites are inlined at their **native pixel size**. Do not resample them here:
the editor displays every icon at an exact integer multiple of its natural size
so the pixel grid stays intact, and a resize step upstream (the old long-edge
cap) silently scaled sprites by a non-integer factor and broke that.

**Module icons are tinted here.** A module's sprite on disk is a white/grey
stencil with black outlines — it is never that colour on screen. The game tints
it at runtime: `ModuleIconWidget.SetColor` assigns the module's `ColorAsset` to
`Image.color`, and Unity multiplies the sprite by it. So the colour is part of
what a module icon *is*, and the same multiply is baked in here (white pixels
become the colour, black outlines stay black, greys become shades of it). Doing
it at extraction rather than in CSS keeps the editor rendering plain `<img>`s
with nearest-neighbour scaling — a CSS blend/mask would have to filter the
scaled-up bitmap and would soften the pixel edges the rule above protects.

Usage (or `bun run extract` for everything):
    .venv/Scripts/python scripts/extract-item-icons.py [path-to-Punk_Data]
"""

from PIL import Image

import punklib


def pick_icon(a: punklib.Asset):
    """The sprite field for a module/consumable/ingredient asset, or None."""
    if a.is_module or a.cls in punklib.CONSUMABLE_CLASSES:
        return a.d.get("icon")
    if a.cls == "Ingredient":
        return a.d.get("iconBig") or a.d.get("iconSmall")
    return None


def tinted(img: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    """Unity's `Image.color`: multiply each channel, leave alpha alone."""
    img = img.convert("RGBA")
    r, g, b, a = img.split()
    channels = [
        channel.point(lambda v, m=multiplier: v * m // 255)
        for channel, multiplier in zip((r, g, b), rgb)
    ]
    return Image.merge("RGBA", (*channels, a))


def run(assets: punklib.PunkAssets) -> None:
    data_uris: dict[str, str] = {}
    tinted_count = 0
    for a in assets.assets():
        icon = pick_icon(a)
        if icon is None:
            continue
        try:
            img = icon.read().image  # PIL.Image cropped to the sprite rect
        except Exception as e:
            print(f"  {a.id}: could not read icon ({e})")
            continue
        rgb = punklib.color_rgb(a.d.get("color")) if a.is_module else None
        if rgb is not None and rgb != (255, 255, 255):
            img = tinted(img, rgb)
            tinted_count += 1
        data_uris[a.id] = punklib.png_data_uri(img)
    punklib.write_json(punklib.DATA_DIR / "item-icons.json", data_uris)
    print(f"  {tinted_count} module icons tinted by their ColorAsset")


if __name__ == "__main__":
    run(punklib.PunkAssets(punklib.game_data_from_argv()))
