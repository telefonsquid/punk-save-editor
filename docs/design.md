# Design system

The rules that make the editor read as PUNK's own UI rather than a web page
about it. The **values** live in [`src/routes/layout.css`](../src/routes/layout.css)
(`@theme` tokens and `punk-*` utilities) — this doc records the rules and where
each one is enforced, so a restyle changes tokens, not call sites. Reference
captures from the game live in `static/design-references/`; every colour and
measurement below was sampled from them, not eyeballed.

## The three faces

Which font goes where mirrors the game, and is not a stylistic call:

| Face | Token | Job | Grid |
| --- | --- | --- | --- |
| `000webfont` | `--font-ui` | everything by default: buttons, labels, values, paragraphs. **Caps only.** | em = 16 bricks → font-size must be a multiple of 16px |
| `8-bit HUD` | `--font-title` | display headings, module titles, HUD digits | em = 5 bricks → font-size must be a multiple of 5px |
| `Perfect DOS VGA 437` | `--font-desc` | module descriptions only — the game's one lowercase body copy | bitmap monospace |

Rules that follow (details at the tokens in layout.css):

- **Sizes come from the `--text-ui-*` / `--text-hud-*` scales**, which land each
  face on its pixel grid. A size off the grid blurs the whole face.
- **Never letterspace 000webfont** — it self-spaces (advance 7, ink 5). The body
  pulls part of that back (`letter-spacing` on `body`); `--tracking-hud*` is for
  8-bit HUD titles only. Anything set in the HUD face resets to
  `letter-spacing: normal` — `punk-hud-num` does this for number fields.
- 000webfont hangs its capital low: pair `punk-cap` with the `--cap-fix`
  bottom-padding recipe to centre a label in a control.
- All three faces are `font-display: block` and preloaded by
  `$lib/editor/busy.ts` `loadFonts()` so nothing pops in late.

## Palette

All greys are warm — every one carries red, so stock Tailwind zinc/neutral reads
cold and wrong next to them. The tokens (sampled values beside each in
layout.css): `--color-void` (page), `--color-surface` (card interior),
`--color-card` + `--color-card-edge` (the module-tooltip slab and its flat
edge — Section, module cards and the raw panel all wear this pair),
`--color-cell-off` (unlit effect-field cell), `--color-edge` / `--color-edge-dim`
(control borders), `--color-ink` / `--color-muted` / `--color-stone` (text),
`--color-accent` (THE interaction colour: hover, focus, active),
`--color-amber` (inline emphasis), `--color-danger`.

**No hard-coded colours in components.** A hex value outside layout.css is a
palette-retune bug waiting to happen — the only exceptions are the hard shadow
blacks inside the `punk-*-shadow` utilities and colours that come from game
data (`resourceColor`, module tints).

## The game pixel

`--u` (on `:root`, 3px — the game's cap-to-frame ratio applied to our 15px
capital) is the unit for everything traced from game captures: `punk-frame`'s
bars, tab boxes, loading cells, control heights. Count in `calc(N * var(--u))`,
never raw pixels. A control may override `--u` locally to redraw at another
scale.

`punk-frame` is PUNK's box — uneven bars (bottom double), all four corner
pixels open. Every interactive control wears it or a deliberate subset (tabs
open toward their rule). Recolour via `--frame`; fill via `--frame-fill`
(transparent by default so the open corners stay open).

## Ripped art

- **Integer scaling only, never a fixed CSS box** — `iconStyle()` in
  `$lib/game/pixel-icon.ts` derives width/height from the PNG itself.
  Extraction must emit sprites at native size.
- **Shared sprites get tinted through a mask** — `tintedIconStyle()` emits the
  one recipe, including the `-webkit-mask` alias older WebKitGTK needs.
- Module sprites are tinted at extraction time instead (a CSS filter over the
  scaled bitmap would soften the pixel edges — see editor-internals.md).

## Shared text shapes

`punk-group-title` (category headings), `punk-game-desc` (DOS body copy),
`punk-stat` / `punk-stat-val` / `punk-stat-icon` (stat lines),
`punk-title-shadow` / `punk-desc-shadow` (the game's hard offset shadows),
`punk-outlined` (eight-shadow keyline for text over moving art),
`punk-hud-num` (chrome-less HUD number fields). If two components need the
same text treatment, it becomes a utility here — the ModulesPanel/ModuleList
fork was the lesson.

## The CRT screen

The app scrolls inside `.crt-screen`, a fixed viewport-sized wrapper carrying
the CRT `filter` — **not** the window. Three traps that follow:

- **Scroll code must target `.crt-screen`** (capture-phase listeners; the
  layout's `afterNavigate` resets it because SvelteKit only resets window
  scroll).
- **`position: fixed` dies inside it** — the filter makes it the containing
  block, so "fixed" elements scroll away with the content. Full-viewport
  overlays ride a zero-height `position: sticky` anchor instead
  (`LoadOverlay.svelte`), or live outside the wrapper like `ScrollBar`.
- The native scrollbar is hidden and `ScrollBar.svelte` draws an overlay one —
  WebView2/WebKitGTK would otherwise show a permanent grey gutter.

## Rhythm

Body copy runs a deliberately tighter line-height (30px) than the
`--text-ui-sm` token's 35px, which is the game's baseline spacing for
standalone text — see the comment on `body` in layout.css before "fixing"
either.

## Where to restyle

`Section` / `Button` / `NumberInput` are the design surface — restyle these
primitives, not every panel. Panels compose them and carry only layout.
