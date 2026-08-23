"""Regenerates src/lib/game/grid-icons.json from the installed game.

The module-grid screen is drawn from a handful of tiny sprites: the ring on an
empty cell, the notch on a module's connection edge, the frame around a module,
the chevron on a boosted one. The editor used to carry hand traces of those,
which quietly rot whenever the game's art changes. This pulls them out of
Punk_Data instead.

Two different mechanisms feed the grid, and both end up here:

- **The cell markers are a shader sheet, not sprites.** `ModuleGridWidget`
  paints the whole backdrop with one `Unlit/GridBackground` RawImage over a
  runtime `Texture2D(100, 100)` LUT — one pixel per cell, black for a normal
  cell, red for `Invalid`, green where `GetLevelDelta > 0`. The shader picks a
  quadrant of the 64x64 `Sprites UI GridSlotTypes` sheet from that pixel, which
  is why `ModuleSlotType.gridVisualPrefab` is null for all three. So the markers
  are cut out of that sheet and its opaque black keyed away.
- **Everything else is an ordinary sprite** on a prefab: `ModuleType.background`
  for the frame, `ConnectionWidget`'s two Images for the notches,
  `ModuleIconWidget.upgradesPrefab` for the boost chevron, and the octagon on
  the `SpecialSlotWidget` every `gridVisualPrefab` points at — Weapon, Active
  and Embedded share one prefab, so all three wear the same glyph and its
  baked-in "WPN".

Sprites are emitted as **SVG path data at native pixel size, one path per
distinct colour**, not as bitmaps. The editor recolours every one of them: a
frame takes the module's colour, a notch the grid's neutral grey, a marker a
palette token. A path per shade keeps that possible and keeps the pixel grid
exact at any zoom (docs/design.md), which a tinted `<img>` could not. Each layer
records `shade`, its brightness against the sprite's brightest colour, so one
CSS colour at that opacity reproduces the sprite's own shading. Shade 0 is the
sprite's black — outline and interior fill — painted as the void, never as a
dark tint of the module colour.

Usage (or `bun run extract` for everything):
    .venv/Scripts/python scripts/extract-grid-icons.py [path-to-Punk_Data]
"""

from PIL import Image

import punklib

# The sheet the GridBackground shader samples, and where each glyph sits in it.
# The shader's `float2(lut.r, lut.g) * 0.5` offset makes the quadrant a function
# of the LUT pixel, so these boxes are the LUT encoding, not a layout choice.
SLOT_SHEET = "Sprites UI GridSlotTypes"
SLOT_SHEET_SIZE = 64
SLOT_QUADRANTS = {
    "slotEmpty": (0, 32, 32, 64),  # LUT black — a normal cell
    "slotBoost": (0, 0, 32, 32),  # LUT green — a level-up slot, or a booster's field
    "slotBlocked": (32, 32, 64, 64),  # LUT red — Invalid
}

# The prefab sprites, by the name they carry in the asset files. Walking the
# prefab hierarchy to reach three sprites costs a full GameObject scan;
# check-data.ts fails loudly if a rename ever loses one.
NOTCH_SPRITE = "HUD_ModuleIcons_0"  # ConnectionWidget idle: a 5x5 ring
NOTCH_LINKED_SPRITE = "HUD_ModuleIcons_1"  # ConnectionWidget connected: half a capsule
BOOST_PIP_SPRITE = "HUD_ModuleIcons_15"  # ModuleIcon_UpgradeUnit: one +1 chevron
SLOT_SPECIAL_SPRITE = "HUD_ModuleIcons_9"  # SpecialSlotWidget background: an octagon

# `Image.color` on the chevron. The sprite on disk is white.
BOOST_PIP_TINT = (0.2846, 0.7736, 0.0)

# Two connected notches meet across the seam and read as one capsule. Each half
# is closed at its outer end and open at the other, so they overlap by the rows
# neither of them draws a bar on.
LINK_OVERLAP = 4


def opaque_pixels(img: Image.Image):
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            if px[x, y][3]:
                yield x, y, px[x, y]


def trim(img: Image.Image) -> Image.Image:
    """The sprite's opaque content, with its transparent padding dropped."""
    box = img.getbbox()
    return img.crop(box) if box else img


def keyed(img: Image.Image) -> Image.Image:
    """The sheet is opaque black behind every glyph — that black is the page,
    not part of the art, so it becomes transparent."""
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    for x, y, pixel in opaque_pixels(img):
        if pixel[:3] != (0, 0, 0):
            out.putpixel((x, y), pixel)
    return out


def tinted(img: Image.Image, tint: tuple[float, float, float]) -> Image.Image:
    """Unity's `Image.color`: multiply each channel, leave alpha alone."""
    r, g, b, a = img.split()
    scaled = [
        channel.point(lambda v, m=round(factor * 255): v * m // 255)
        for channel, factor in zip((r, g, b), tint)
    ]
    return Image.merge("RGBA", (*scaled, a))


def luminance(colour) -> float:
    r, g, b = colour[:3]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def row_runs(img: Image.Image, colour) -> str:
    """One colour's pixels as SVG path data — a rect per horizontal run, so the
    path stays as small as the art is regular."""
    px = img.load()
    parts = []
    for y in range(img.height):
        x = 0
        while x < img.width:
            if px[x, y] == colour:
                start = x
                while x < img.width and px[x, y] == colour:
                    x += 1
                parts.append(f"M{start} {y}h{x - start}v1H{start}z")
            else:
                x += 1
    return "".join(parts)


def sprite_entry(img: Image.Image, source: str) -> dict:
    """One sprite as `{w, h, layers}`, brightest layer first."""
    colours = sorted({p for _, _, p in opaque_pixels(img)}, key=lambda c: -luminance(c))
    brightest = luminance(colours[0]) if colours else 0.0
    return {
        "w": img.width,
        "h": img.height,
        "source": source,
        "layers": [
            {
                "shade": round(luminance(c) / brightest, 3) if brightest else 0.0,
                "color": "#%02x%02x%02x" % c[:3],
                "d": row_runs(img, c),
            }
            for c in colours
        ],
    }


def linked_notch(half: Image.Image) -> Image.Image:
    """The capsule two connected modules draw together, composed the way the
    game does it: the same half sprite twice, the far one turned around."""
    height = half.height * 2 - LINK_OVERLAP
    out = Image.new("RGBA", (half.width, height), (0, 0, 0, 0))
    out.alpha_composite(half.rotate(180), (0, 0))
    out.alpha_composite(half, (0, height - half.height))
    return out


def slot_markers(assets: punklib.PunkAssets) -> dict[str, dict]:
    sheet = None
    for obj in assets.env.objects:
        if obj.type.name != "Texture2D":
            continue
        data = obj.read()
        if (data.m_Name or "") == SLOT_SHEET:
            sheet = data.image.convert("RGBA")
            break
    if sheet is None:
        punklib.warn(f"{SLOT_SHEET} not found — the grid's cell markers are missing")
        return {}
    if sheet.width != SLOT_SHEET_SIZE or sheet.height != SLOT_SHEET_SIZE:
        punklib.warn(
            f"{SLOT_SHEET} is {sheet.width}x{sheet.height}, expected "
            f"{SLOT_SHEET_SIZE} square — the LUT encoding moved, re-read the shader"
        )
    out = {}
    for name, box in SLOT_QUADRANTS.items():
        glyph = trim(keyed(sheet.crop(box)))
        if not glyph.getbbox():
            punklib.warn(f"{SLOT_SHEET} quadrant {box} is empty — {name} lost its glyph")
            continue
        out[name] = sprite_entry(glyph, f"{SLOT_SHEET} {box}")
    return out


def widget_sprites(assets: punklib.PunkAssets) -> dict[str, dict]:
    out = {}
    for name, sprite_name in (
        ("notch", NOTCH_SPRITE),
        ("notchLinked", NOTCH_LINKED_SPRITE),
        ("boostPip", BOOST_PIP_SPRITE),
        ("slotSpecial", SLOT_SPECIAL_SPRITE),
    ):
        img = punklib.find_sprite(assets, sprite_name)
        if img is None:
            punklib.warn(f"sprite {sprite_name} not found — the grid's {name} is missing")
            continue
        img = trim(img)
        if name == "notchLinked":
            img = linked_notch(img)
        if name == "boostPip":
            img = tinted(img, BOOST_PIP_TINT)
        out[name] = sprite_entry(img, sprite_name)
    return out


def module_type_frames(assets: punklib.PunkAssets) -> dict[str, dict]:
    """`ModuleType.background` per shop category — the frame a module wears."""
    frames = {}
    for obj in assets.env.objects:
        if obj.type.name != "MonoBehaviour" or assets.script_class(obj) != "ModuleType":
            continue
        fields = obj.read(check_read=False).__dict__
        name = fields.get("displayName") or fields.get("m_Name")
        background = fields.get("background")
        if not name or background is None or not punklib.path_id(background):
            punklib.warn(f"ModuleType {name!r} has no background sprite")
            continue
        try:
            img = background.read().image.convert("RGBA")
        except Exception as e:
            punklib.warn(f"ModuleType {name!r}: background unreadable ({e})")
            continue
        frames[f"frame:{name}"] = sprite_entry(img, f"ModuleType {name}.background")
    return frames


def run(assets: punklib.PunkAssets) -> None:
    frames = module_type_frames(assets)
    sprites = {**slot_markers(assets), **widget_sprites(assets), **frames}

    # Every frame is drawn into the same grid cell, so the widest one *is* the
    # cell. The smaller rect frame simply centres in it, and what is left over
    # is the gap the game leaves between two neighbours.
    cell = max((f["w"] for f in frames.values()), default=0)
    punklib.write_json(
        punklib.DATA_DIR / "grid-icons.json",
        {"cell": cell, "sprites": dict(sorted(sprites.items()))},
    )
    print(f"  cell {cell}px, {len(frames)} frames, {len(sprites) - len(frames)} widget sprites")


if __name__ == "__main__":
    run(punklib.PunkAssets(punklib.game_data_from_argv()))
