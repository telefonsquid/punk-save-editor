"""Build the editor's own icon set from the game's player-ship sprite.

The game's own window icon is a soft, upscaled version of this same little ship.
Here it is rebuilt crisp and given the editor's own accent: the ship as the game
draws it (white outline, black hull) with its headlight band lit in PUNK orange,
sitting on a warm near-black tile. All page art rather than game data, so it
follows extract-logo.py and lands in static/ rather than src/lib/game.

Pixel art must never be left to the browser to shrink: nearest-neighbour
fragments the grid and bicubic blurs it. So every small size is rendered here at
its own integer scale (or a clean downscale where nothing else fits) and the tab
sizes are packed into a multi-resolution .ico, letting the browser *pick* a
hand-made bitmap instead of scaling one. The full modern set:

- `static/icon.svg` — one <rect> per pixel run; the scalable master for modern
  browsers and high-DPI tabs.
- `static/favicon.ico` — 16/32/48 bitmaps in one file, for tab and legacy use.
- `static/apple-touch-icon.png` — 180px on a solid tile (iOS drops transparency).
- `static/icon-192.png` / `static/icon-512.png` — full-bleed with a safe margin
  for the web manifest's maskable icons.
- `static/site.webmanifest` — names the app and points at the two PNGs above.
- `static/app-icon.png` — 1024px master that `bun tauri icon` slices into the
  desktop set.

Page art like the wordmark, so it runs on its own rather than through
extract-all.py. After it, regenerate the desktop set: `bun tauri icon
static/app-icon.png`.

    .venv/Scripts/python.exe scripts/extract-app-icon.py
"""

from __future__ import annotations

import struct
from io import BytesIO

from PIL import Image, ImageDraw

import punklib

# The player ship the game flies. Its body sprite is the whole readable shape;
# the separate "highlight" sprite is an in-game lighting overlay that swamps the
# outline when composited, so it is left out.
SPRITE_NAME = "Sprite Ship Body"

# Editor palette (src/routes/layout.css), so the icon matches the app it opens.
TILE = (25, 21, 18)  # --color-surface #191512
OUTLINE = (254, 254, 254)  # --color-ink #fefefe
ACCENT = (254, 158, 32)  # --color-accent #fe9e20
HULL = (0, 0, 0)  # the ship's own black fill

# The bright bar across the ship's middle: the central white run on these two
# rows. Lighting it in the accent is the one liberty that makes the mark ours.
BAND_ROWS = (8, 9)
BAND_COLS = range(7, 17)

REPO = punklib.REPO
STATIC = REPO / "static"


def load_ship() -> Image.Image:
	assets = punklib.PunkAssets(punklib.game_data_from_argv())
	for obj in assets.env.objects:
		if obj.type.name != "Sprite":
			continue
		try:
			data = obj.read()
		except Exception:
			continue
		if (data.m_Name or "") == SPRITE_NAME:
			return data.image.convert("RGBA")
	punklib.warn(f"sprite {SPRITE_NAME!r} not found — did the ship art get renamed?")
	raise SystemExit(1)


def classify(ship: Image.Image):
	"""Pixel grid -> colour per cell, or None where transparent, cropped to the
	ship's own bounds so it centres on the pixels rather than the sprite's empty
	margin (which sat it off to one side)."""
	px = ship.load()
	grid = []
	for y in range(ship.height):
		row = []
		for x in range(ship.width):
			r, g, b, a = px[x, y]
			if a < 40:
				row.append(None)
			elif (r + g + b) / 3 > 140:
				lit = y in BAND_ROWS and x in BAND_COLS
				row.append(ACCENT if lit else OUTLINE)
			else:
				row.append(HULL)
		grid.append(row)

	xs = [x for row in grid for x, c in enumerate(row) if c]
	ys = [y for y, row in enumerate(grid) for c in row if c]
	x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
	return [row[x0 : x1 + 1] for row in grid[y0 : y1 + 1]]


def ship_image(grid) -> Image.Image:
	h, w = len(grid), len(grid[0])
	img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
	px = img.load()
	for y, row in enumerate(grid):
		for x, c in enumerate(row):
			if c:
				px[x, y] = (*c, 255)
	return img


def hexc(c) -> str:
	return "#%02x%02x%02x" % c


def rounded_mask(size: int, radius: int) -> Image.Image:
	# Draw big and shrink so the corner is anti-aliased while ship pixels stay hard.
	s = 4
	m = Image.new("L", (size * s, size * s), 0)
	ImageDraw.Draw(m).rounded_rectangle(
		[0, 0, size * s - 1, size * s - 1], radius=radius * s, fill=255
	)
	return m.resize((size, size), Image.LANCZOS)


def scaled_ship(ship: Image.Image, target_w: float) -> Image.Image:
	"""Ship at a crisp integer scale when it fits, else one clean downscale — never
	a fractional upscale, which is what smears pixel art."""
	sw, sh = ship.size
	if target_w >= sw:
		f = max(1, round(target_w / sw))
		return ship.resize((sw * f, sh * f), Image.NEAREST)
	r = target_w / sw
	return ship.resize((max(1, round(sw * r)), max(1, round(sh * r))), Image.LANCZOS)


def render(size: int, ship: Image.Image, frac: float, *, rounded: bool, radius=0.16) -> Image.Image:
	"""One icon: the tile, then the ship centred at `frac` of the width."""
	img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
	fill = Image.new("RGBA", (size, size), (*TILE, 255))
	if rounded:
		img.paste(fill, (0, 0), rounded_mask(size, max(1, round(size * radius))))
	else:
		img.paste(fill, (0, 0))
	s = scaled_ship(ship, size * frac)
	img.alpha_composite(s, ((size - s.width) // 2, (size - s.height) // 2))
	return img


def write_svg(grid) -> None:
	h, w = len(grid), len(grid[0])
	side = w + 2  # 1px of margin each side of the widest row
	dx, dy = (side - w) // 2, (side - h) // 2
	rects = [f'<rect width="{side}" height="{side}" rx="{round(side * 0.12)}" fill="{hexc(TILE)}"/>']
	# Merge each run of same-colour cells in a row into one rect: fewer, and shared
	# edges never hairline-crack the way abutting rects can when scaled.
	for y in range(h):
		x = 0
		while x < w:
			c = grid[y][x]
			if c is None:
				x += 1
				continue
			run = 1
			while x + run < w and grid[y][x + run] == c:
				run += 1
			rects.append(f'<rect x="{dx + x}" y="{dy + y}" width="{run}" height="1" fill="{hexc(c)}"/>')
			x += run
	svg = (
		f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {side} {side}" '
		f'shape-rendering="crispEdges">\n\t' + "\n\t".join(rects) + "\n</svg>\n"
	)
	(STATIC / "icon.svg").write_text(svg, encoding="utf-8")
	print(f"  icon.svg: {len(rects)} rects")


def write_ico(images) -> None:
	# A .ico is just a directory of images; embedding PNGs keeps each hand-made
	# bitmap exactly as rendered.
	blobs = []
	for im in images:
		buf = BytesIO()
		im.save(buf, format="PNG")
		blobs.append(buf.getvalue())
	out = struct.pack("<HHH", 0, 1, len(images))
	offset = 6 + 16 * len(images)
	for im, blob in zip(images, blobs):
		out += struct.pack("<BBBBHHII", im.width, im.height, 0, 0, 1, 32, len(blob), offset)
		offset += len(blob)
	(STATIC / "favicon.ico").write_bytes(out + b"".join(blobs))
	print(f"  favicon.ico: {', '.join(str(im.width) for im in images)}")


MANIFEST = """{
	"name": "PUNK Save Editor",
	"short_name": "PUNK",
	"icons": [
		{ "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
		{ "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
	],
	"theme_color": "#000000",
	"background_color": "#000000",
	"display": "standalone"
}
"""


def main() -> None:
	STATIC.mkdir(parents=True, exist_ok=True)
	grid = classify(load_ship())
	ship = ship_image(grid)

	write_svg(grid)
	# Rounded-tile tab icons at their own integer scale.
	write_ico([render(s, ship, 0.86, rounded=True, radius=0.12) for s in (16, 32, 48)])
	# iOS drops transparency, so a full solid tile with room to breathe.
	render(180, ship, 0.72, rounded=False).save(STATIC / "apple-touch-icon.png")
	# Maskable manifest icons: full-bleed, ship inside the safe centre.
	render(192, ship, 0.62, rounded=False).save(STATIC / "icon-192.png")
	render(512, ship, 0.62, rounded=False).save(STATIC / "icon-512.png")
	(STATIC / "site.webmanifest").write_text(MANIFEST, encoding="utf-8")
	# Rounded 1024 master for `bun tauri icon`.
	render(1024, ship, 0.86, rounded=True, radius=0.14).save(STATIC / "app-icon.png")
	print("  apple-touch-icon.png, icon-192/512.png, site.webmanifest, app-icon.png")


if __name__ == "__main__":
	main()
