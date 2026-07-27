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
edge — see `punk-slab`), `--color-cell-off` (unlit effect-field cell),
`--color-grid-gap` (the dark between those cells), `--color-edge` /
`--color-edge-dim` (control borders), `--color-press` (a held control's
interior), `--color-ink` / `--color-muted` / `--color-stone` (text),
`--color-accent` (THE interaction colour: hover, focus, active),
`--color-amber` (inline emphasis), `--color-danger`, `--color-regen` (the one
green — a gain), `--color-backdrop` (behind a modal).

**No hard-coded colours in components.** A hex value outside layout.css is a
palette-retune bug waiting to happen — the only exceptions are the hard shadow
blacks inside the `punk-*-shadow` utilities and colours that come from game
data (`resourceColor`, module tints).

This one is **enforced**, not just written down: `bun run lint` runs
`scripts/check-style.ts`, which fails on a stock Tailwind palette class or a
colour literal anywhere under `src/lib/components` or `src/routes` (layout.css
excepted). It drifted three times before the check existed. A colour that is
genuinely artwork rather than palette — the logo's sampled ramp — says so with a
`palette-ok:` (one line) or `palette-ok-file:` comment giving the reason.

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

## The three box shapes

Every surface in the editor is one of three boxes, and each is one utility:

- **`punk-frame`** (above) — an interactive control the game itself draws:
  buttons, number fields, the connection toggles.
- **`punk-slab`** — a card. The module tooltip's shell: `--color-card` behind a
  2px `--color-card-edge`, square corners. `Section`, the module cards, the raw
  panel and both dialogs all wear it, so the card colours retune in one place.
  Padding stays with the caller — a section, a card and a dialog want different
  insets out of the same slab.
- **`punk-field`** — a text, search or select box. The game has none, so this is
  the editor's own: a 2px `--color-edge-dim` box that answers the pointer in the
  same three states as everything else (quiet → accent → ink), and clears the
  fill and blue ring `@tailwindcss/forms` puts on every input. Deliberately
  simpler than `punk-frame`, which is four background bars per control and too
  much paint for a raw tree running hundreds of rows deep.

## Shared text shapes

`punk-panel-title` (the heading over anything slab-shaped — Section, the raw
panel, a dialog title band, a module card's name; it sets the shape and leaves
the *colour* to the caller, which is what lets `punk-group-title` be the same
shape spoken quietly), `punk-group-title` (category headings), `punk-game-desc`
(DOS body copy), `punk-stat` / `punk-stat-val` / `punk-stat-icon` (stat lines),
`punk-title-shadow` / `punk-desc-shadow` (the game's hard offset shadows),
`punk-outlined` (eight-shadow keyline for text over moving art),
`punk-hud-num` (chrome-less HUD number fields). If two components need the
same text treatment, it becomes a utility here — the ModulesPanel/ModuleList
fork was the lesson, and the panel title having grown five private copies before
`punk-panel-title` existed was the same lesson a second time.

**Sizing a utility from a call site:** two utilities both declaring `font-size`
are settled by their order in the generated sheet, which is not something a
component may bet on. A component that needs a shared shape at another size
declares it in its own scoped block (`Section`'s `.is-plain`, the module card's
`.card-name`), which outranks both.

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

## Arrival motion

One motion, everywhere: a rise-and-fade. The distance and the two eases are the
`--reveal-*` tokens in layout.css, and nothing restates them — retuning the
arrival is a token change.

Two mechanisms play it, because the trigger differs:

- **`use:reveal`** ([`src/lib/actions/reveal.ts`](../src/lib/actions/reveal.ts))
  for anything that arrives by scrolling — every `Section`, every module card. A
  position sweep drives it rather than an IntersectionObserver, which would jump
  over rows when the scrollbar is dragged; `delay` staggers one behind another.
- **A CSS animation on `[open]`** for `Dialog`. A modal has no fold to cross, so
  opening is its equivalent of scrolling into view. Split into two animations so
  opacity and position keep their own eases, exactly as the action pairs them.

Nothing plays on exit, and `prefers-reduced-motion: reduce` skips the arrival
entirely rather than shortening it — the element is simply there.

## Where to restyle

The primitives are the design surface — restyle these, not every panel. Panels
compose them and carry only layout.

| Primitive | Owns |
| --- | --- |
| `Section` | the panel card and its heading (`plain` drops the card) |
| `Dialog` | every modal: the `showModal` call, the backdrop, the title/footer bands |
| `Button` | every button, in four loudness variants — colour never carries meaning |
| `NumberInput` | a framed number field |
| `InlineNumber` | a chrome-less HUD number, sized `sm`/`xs` |
| `CounterCell` | an inventory-strip entry: HUD number plus the item's own art |
| `TextInput` / `Select` | the editor's own text and dropdown boxes |
| `CloseBadge` | the cross that removes what it sits on (`bare` / `boxed`) |
| `ModuleStatLine` / `ModuleGroupHeading` | the parts every module surface shares |

**Destructive actions read as destructive**: `Button variant="danger"` or a
`CloseBadge`, never `primary`. `primary` is the call to action.
