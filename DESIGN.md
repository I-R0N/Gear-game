# Gear Works — Art Direction

## Brief: "Machined Instrument"

1. Gear Works is a **precision instrument, not a toy**: the screen is the anodised top
   plate of a bench machine, and the player is standing over it.
2. The play field is a **milled graphite arena** — etched with a faint drafting lattice,
   lit from the upper-left, darkening to a vignette at the edges of the plate.
3. Chrome is **machined panel, never a floating card**: recessed grooves, single-pixel
   milled highlights on top edges, controls that read as engraved keycaps you can press.
4. Exactly **two signal colours**: amber = power & authority (motor, drive, selection),
   ice-cyan = data & measurement (telemetry pills, mesh lines, pitch circles).
   Green confirms, red faults. Nothing else gets to glow.
5. Motion is **mechanical**: short, weighted, decisive. Things seat and detent.
   Nothing bounces, nothing drifts, nothing pulses for decoration.

Gear bodies keep their existing size-coded hues (that is gameplay information) but are
re-tuned to **anodised alloy**: same hue family, tighter luminance band, so a train of
mixed gears reads as one machined assembly rather than a bag of sweets.

---

## Structural decision: HTML/CSS chrome over a canvas simulation

The simulation (gears, racks, rings, linkages, mesh lines, floating telemetry pills)
stays **entirely on `<canvas>`** — it is world-space, camera-transformed, and 60fps.

Everything that is *static screen furniture* moved to a **DOM chrome layer** stacked over
the canvas: title screen, top status bar, the tool rail, the hint bar, and the level-complete
overlay. Reasons, stated as an intentional decision:

- Real type rendering: subpixel-aware text, tracking, `font-feature-settings`, tabular
  numerals, and text that stays crisp at any DPR without re-measuring in canvas.
- Real interaction states: `:hover`, `:active`, `:disabled`, `:focus-visible` and
  `aria-pressed` come for free and are consistent, instead of hand-rolled hit-test states.
- Real responsiveness: one media query turns the desktop tool rail into a mobile dock with
  44px touch targets. Doing that in canvas would mean re-implementing layout.
- Accessibility: buttons are `<button>`s, reachable by keyboard and screen readers.

**Pointer mapping is preserved.** The canvas still fills the viewport and still receives all
world pointer events. Chrome elements sit above it with `pointer-events` enabled only on
interactive controls (the layer itself is `pointer-events:none`). The tool rail publishes its
CSS-pixel rect back into the game each layout pass (`Game.menu.set_rect`), so
"drag a gear onto the tool rail to delete it" keeps working exactly as before, and
`screen_to_world` / `screen_to_ui` are untouched.

**Physics, meshing, snapping, ratios, damping and level solvability are untouched.**
This pass changes presentation only.

---

## Design tokens

All tokens exist twice, kept in sync by hand at the top of `gear_works.html`:
CSS custom properties on `:root` (for chrome) and the `T` object (for canvas).

### Palette

| Token | Hex | Use |
| --- | --- | --- |
| `--void` | `#06080B` | behind everything; overlay scrim base |
| `--field` | `#0B0E14` | arena floor (canvas background) |
| `--field-hi` | `#141A24` | arena light pool, upper-left |
| `--panel` | `#111621` | panel fill, bottom of gradient |
| `--panel-hi` | `#1A2130` | panel fill, top of gradient |
| `--keycap` | `#1C2432` | control face, bottom |
| `--keycap-hi` | `#273142` | control face, top |
| `--groove` | `#05070A` | engraved shadow line under an edge |
| `--edge` | `#2A3446` | 1px structural border |
| `--edge-hi` | `#43526E` | milled highlight hairline (top edges) |
| `--ink` | `#EAF0FA` | primary text |
| `--ink-2` | `#A2B0C6` | secondary text |
| `--ink-3` | `#6C7A91` | tertiary / hints |
| `--ink-4` | `#46536A` | disabled |
| `--amber` | `#FFB020` | power: drive marker, selection, motor authority |
| `--amber-hi` | `#FFD98A` | amber text on dark |
| `--amber-dim` | `#6E4B10` | amber at rest / inactive track |
| `--cyan` | `#5FD9FF` | data: telemetry, mesh lines, measurement |
| `--cyan-hi` | `#B7EEFF` | cyan text on dark |
| `--cyan-dim` | `#17546B` | cyan at rest |
| `--green` | `#4BE39B` | target satisfied, level complete |
| `--red` | `#FF6252` | fault, locked train, fully-wound spring |

### Alloy (gear bodies — size-coded, do not repurpose)

| Token | Hex | Part |
| --- | --- | --- |
| `--alloy-u1` | `#7C5FB4` | U1 triangle — anodised violet |
| `--alloy-u2` | `#2E8B85` | U2 small hex — anodised teal |
| `--alloy-u3` | `#B0783F` | U3 hex — anodised bronze |
| `--alloy-u4` | `#AC4D63` | U4 hex — anodised crimson |
| `--alloy-u5` | `#5062B4` | U5 hex — anodised indigo |
| `--alloy-sp` | `#3F8A57` | spring gear — anodised green |
| `--alloy-rack` | `#5B6580` | rack bar — raw steel |
| `--alloy-ring` | `#2F7F6E` | ring gear — anodised sea |
| `--alloy-rod` | `#D2A24A` | linkage rod — brass |

Every alloy gets a machined treatment derived from the base hex: `×1.34` top-left facet,
`×0.62` bottom-right facet, a 12°-wide specular sweep at `+38%` lightness, and a
`rgba(0,0,0,.55)` engraved outline. That derivation lives in one place (`shadeHex`), so a
new part only needs a base hex to inherit the material.

### Type

Families (subset WOFF2, embedded as data URIs — the file stays self-contained):

- **IBM Plex Sans** 400 / 600 / 700 — UI, labels, titles.
- **IBM Plex Mono** 500 / 600 — every number the player reads: rpm, torque, travel,
  turns, speed. Mono is what makes a changing readout stop twitching.

Scale (px) — `--fs-*`: `10` micro · `11` caption · `12` label · `13` body-sm · `15` body ·
`18` subhead · `24` title · `34` display-sm · `48` display.

Rules: uppercase micro/label/caption carry `+0.10em` tracking and weight 600; display
carries `-0.01em` and weight 700; body is 400. Line-height `1.35` body, `1.08` display.

### Space, radius, stroke

- Base unit **4px**. Scale `--sp-1..7` = 4 · 8 · 12 · 16 · 24 · 32 · 48.
- Radii `--r-1..4` = 3 (chip) · 6 (control) · 10 (panel) · 14 (overlay card); `--r-pill` 999.
- Hairline 1px `--edge`; structural stroke 2px; emphasis stroke 3px.
- Minimum touch target **44px** (enforced on the mobile dock).

### Elevation

- `--e-inset` — recessed groove: `inset 0 1px 0 rgba(255,255,255,.045), inset 0 -1px 0 rgba(0,0,0,.5)`
- `--e-1` — panel: `0 1px 0 rgba(255,255,255,.05) inset, 0 10px 28px -14px rgba(0,0,0,.9)`
- `--e-2` — raised control: `0 1px 0 rgba(255,255,255,.07) inset, 0 2px 4px rgba(0,0,0,.5)`
- `--e-3` — overlay: `0 32px 80px -24px rgba(0,0,0,.92)`
- `--glow-amber` — `0 0 0 1px rgba(255,176,32,.55), 0 0 18px -2px rgba(255,176,32,.35)`
- `--glow-cyan` — `0 0 0 1px rgba(95,217,255,.45), 0 0 16px -2px rgba(95,217,255,.30)`

### Motion

- Durations `--d-1` 90ms (press) · `--d-2` 160ms (hover / state) · `--d-3` 260ms
  (panel, overlay) · `--d-4` 420ms (screen change).
- Easing `--ease-out` `cubic-bezier(.22,1,.36,1)` · `--ease-inout` `cubic-bezier(.65,0,.35,1)`
  · `--ease-press` `cubic-bezier(.4,0,1,1)`.
- Press = `translateY(1px)` + inner shadow, never a scale-bounce.
- Screen transitions = 8px rise + fade over `--d-4`, staggered 18ms per row.
- All of it collapses under `prefers-reduced-motion: reduce`.

### Performance rules

- No per-frame allocation in the draw path: gradients, tooth tables and pill geometry are
  cached per gear and invalidated only when radius/teeth change.
- Chrome DOM text is only written when its string actually changes (`_setText` guard), so a
  running sim does not touch layout each frame.
- Canvas shadows (`ctx.shadowBlur`) are used only on ≤2 elements per frame; everything else
  fakes depth with gradients and offset strokes.
